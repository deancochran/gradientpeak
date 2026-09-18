import { act, renderHook } from "@testing-library/react-native";
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";

(globalThis as typeof globalThis & { __DEV__: boolean }).__DEV__ = false;
const backMock = jest.fn();
const alertMock = jest.fn();
const createMock = jest.fn(async (_input: unknown) => ({ id: "created-1" }));
const updateMock = jest.fn(async (_input: unknown) => ({ id: "updated-1" }));
const getByIdMock = jest.fn(() => ({ data: undefined, isLoading: false }));
const refetchMock = jest.fn();
let createOptions: { onSuccess: (data: { id: string }) => Promise<void> };
jest.mock("@repo/api/react", () => ({
  invalidateActivityPlanQueries: jest.fn(async () => undefined),
}));

jest.mock("expo-router", () => ({ __esModule: true, useRouter: () => ({ back: backMock }) }));
jest.mock("expo-crypto", () => ({
  __esModule: true,
  randomUUID: () => "00000000-0000-4000-8000-000000000099",
}));
jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: alertMock },
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      activityPlans: {
        list: { invalidate: jest.fn(async () => undefined) },
        getUserPlansCount: { invalidate: jest.fn(async () => undefined) },
        getById: { invalidate: jest.fn(async () => undefined) },
      },
    }),
    activityPlans: {
      getById: { useQuery: () => getByIdMock() },
      create: {
        useMutation: (options: typeof createOptions) => {
          createOptions = options;
          return { mutateAsync: createMock, isPending: false, error: null };
        },
      },
      update: { useMutation: () => ({ mutateAsync: updateMock, isPending: false, error: null }) },
    },
  },
}));

import { useActivityPlanForm } from "../useActivityPlanForm";

const ids = {
  segment: "00000000-0000-4000-8000-000000000001",
  interval: "00000000-0000-4000-8000-000000000002",
  step: "00000000-0000-4000-8000-000000000003",
  segment2: "00000000-0000-4000-8000-000000000005",
  interval2: "00000000-0000-4000-8000-000000000006",
  step2: "00000000-0000-4000-8000-000000000007",
};

function validStructure() {
  return {
    version: 3 as const,
    activity_category: "bike" as const,
    segments: [
      {
        id: ids.segment,
        role: "activity" as const,
        name: "Bike",
        intervals: [
          {
            id: ids.interval,
            name: "Main",
            repetitions: 2,
            steps: [
              {
                id: ids.step,
                name: "Steady",
                purpose: "work" as const,
                duration: { type: "time" as const, seconds: 300 },
                targets: [{ type: "%FTP" as const, intensity: 75 }],
              },
            ],
          },
        ],
      },
      {
        id: ids.segment2,
        role: "activity" as const,
        name: "Bike again",
        intervals: [
          {
            id: ids.interval2,
            name: "Finish",
            repetitions: 1,
            steps: [
              {
                id: ids.step2,
                name: "Finish",
                purpose: "work" as const,
                duration: { type: "time" as const, seconds: 300 },
                targets: [{ type: "%FTP" as const, intensity: 70 }],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("useActivityPlanForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getByIdMock.mockReturnValue({ data: undefined, isLoading: false });
    refetchMock.mockResolvedValue({ data: undefined, isError: true });
    useActivityPlanCreationStore.setState({
      name: "Morning brick",
      description: "",
      activityCategory: "bike",
      notes: "",
      structure: { version: 3, activity_category: "bike", segments: [] },
    });
  });

  it("single-flights a pending write and retains the draft on rejection", async () => {
    useActivityPlanCreationStore.setState({
      structure: validStructure(),
      description: "Keep instructions",
    });
    let reject!: (error: Error) => void;
    createMock.mockReturnValueOnce(
      new Promise((_done, fail) => {
        reject = fail;
      }),
    );
    const { result } = await renderHook(() => useActivityPlanForm());
    await act(() => {
      void result.current.submit();
      void result.current.submit();
    });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result.current.isSubmitting).toBe(true);
    await act(async () => reject(new Error("Write unavailable")));
    expect(result.current.form.description).toBe("Keep instructions");
    expect(result.current.submitError).toBe("Write unavailable");
    expect(result.current.isSubmitting).toBe(false);
  });

  it("does not clear a new editor's store after an old create completes", async () => {
    useActivityPlanCreationStore.setState({ structure: validStructure() });
    const onSuccess = jest.fn();
    const view = await renderHook(() => useActivityPlanForm({ onSuccess }));
    const oldSuccess = createOptions.onSuccess;
    await view.unmount();
    useActivityPlanCreationStore.setState({ name: "New editor draft" });
    await act(async () => oldSuccess({ id: "created-1" }));
    expect(useActivityPlanCreationStore.getState().name).toBe("New editor draft");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("rejects a missing segment list", async () => {
    const { result } = await renderHook(() => useActivityPlanForm());
    expect(result.current.canSubmit).toBe(false);
    expect(Object.values(result.current.validation.errors)[0]).toContain("Too small");
  });

  it("counts compiled repeats and explicit boundary time", async () => {
    useActivityPlanCreationStore.setState({ structure: validStructure() });
    const { result } = await renderHook(() => useActivityPlanForm());
    expect(result.current.metrics.stepCount).toBe(3);
    expect(result.current.metrics.duration).toBe(15);
  });

  it("maps segment paths to interval and step UI error keys", async () => {
    const structure = validStructure();
    const firstActivity = structure.segments[0];
    const secondActivity = structure.segments[1];
    if (!firstActivity || firstActivity.role !== "activity") throw new Error("missing activity");
    if (!secondActivity || secondActivity.role !== "activity") throw new Error("missing activity");
    const firstInterval = firstActivity.intervals[0];
    const secondStep = secondActivity.intervals[0]?.steps[0];
    if (!firstInterval || !secondStep) throw new Error("missing interval step");
    firstInterval.repetitions = 0;
    secondStep.duration = {
      type: "time",
      seconds: 0,
    };
    useActivityPlanCreationStore.setState({ structure });

    const { result } = await renderHook(() => useActivityPlanForm());

    expect(result.current.validation.errors[`interval:${ids.interval}:repetitions`]).toBeDefined();
    expect(
      result.current.validation.errors[`step:${ids.interval2}:${ids.step2}:duration`],
    ).toBeDefined();
  });

  it("submits only strict structures without a synthetic activity_category field", async () => {
    useActivityPlanCreationStore.setState({ structure: validStructure() });
    const { result } = await renderHook(() => useActivityPlanForm());
    await act(async () => {
      await expect(result.current.submit()).resolves.toEqual({ id: "created-1" });
    });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ structure: expect.objectContaining({ version: 3 }) }),
    );
    expect(createMock.mock.calls[0]?.[0]).not.toHaveProperty("activity_category");
    expect(createMock.mock.calls[0]?.[0]).not.toHaveProperty("route_id");
    expect(createMock.mock.calls[0]?.[0]).not.toHaveProperty("routeId");
  });

  it("keeps an existing canonical plan editable and submittable", async () => {
    const structure = validStructure();
    getByIdMock.mockReturnValue({
      data: {
        detail: null,
        edit: {
          id: "plan-1",
          name: "Existing plan",
          description: null,
          notes: null,
          structure,
          structureHash: "a".repeat(64),
          activityPlanRevision: 7,
          gpsRecordingEnabled: true,
          contentVisibility: "private",
          trainingIntent: "aerobic_base",
          adaptation: null,
        },
      },
      isLoading: false,
    } as never);
    const { result } = await renderHook(() => useActivityPlanForm({ planId: "plan-1" }));
    await act(async () => undefined);

    expect(result.current.editStatus).toBe("editable");
    expect(result.current.canSubmit).toBe(true);
    await act(async () => {
      await expect(result.current.submit()).resolves.toEqual({ id: "updated-1" });
    });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "plan-1",
        structure,
        expectedStructureHash: "a".repeat(64),
        expectedRevision: 7,
        training_intent: "aerobic_base",
        adaptation: null,
      }),
    );
  });

  it("preserves an edited draft when an explicit server reload fails", async () => {
    const structure = validStructure();
    const edit = {
      id: "plan-1",
      name: "Existing plan",
      description: null,
      notes: null,
      structure,
      structureHash: "a".repeat(64),
      gpsRecordingEnabled: true,
      contentVisibility: "private",
    };
    getByIdMock.mockReturnValue({
      data: { detail: null, edit },
      isError: false,
      isLoading: false,
      refetch: refetchMock,
    } as never);
    refetchMock.mockResolvedValue({ data: { detail: null, edit }, isError: true });

    const { result } = await renderHook(() => useActivityPlanForm({ planId: "plan-1" }));
    await act(async () => undefined);
    await act(async () => result.current.setName("Keep this draft"));

    await act(async () => {
      await expect(result.current.reloadFromServer()).resolves.toBe(false);
    });

    expect(result.current.form.name).toBe("Keep this draft");
    refetchMock.mockResolvedValue({
      data: { edit: { ...edit, name: "Fresh server name" } },
      isError: false,
    });
    await act(async () => {
      await result.current.retryLoad();
    });
    expect(result.current.form.name).toBe("Keep this draft");
  });
  it("keeps the loaded revision token with the draft across background refetch and conflicts", async () => {
    const edit = {
      id: "plan-1",
      name: "Loaded",
      description: null,
      notes: null,
      structure: validStructure(),
      structureHash: "a".repeat(64),
      activityPlanRevision: 7,
      trainingIntent: "general_maintenance",
      adaptation: null,
      gpsRecordingEnabled: true,
      contentVisibility: "private",
    };
    getByIdMock.mockReturnValue({ data: { edit }, isLoading: false } as never);
    const view = await renderHook(() => useActivityPlanForm({ planId: "plan-1" }));
    await act(async () => view.result.current.setName("Keep draft"));
    getByIdMock.mockReturnValue({
      data: { edit: { ...edit, activityPlanRevision: 8 } },
      isLoading: false,
    } as never);
    await view.rerender({});
    updateMock.mockRejectedValueOnce(new Error("STALE_ACTIVITY_PLAN_REVISION"));
    await act(async () => {
      await view.result.current.submit();
    });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Keep draft", expectedRevision: 7 }),
    );
    expect(view.result.current.form.name).toBe("Keep draft");
  });
});
