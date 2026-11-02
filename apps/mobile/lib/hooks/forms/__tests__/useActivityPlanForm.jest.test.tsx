import type { ActivityPlanDraftStructure } from "@repo/core";
import { act, renderHook } from "@testing-library/react-native";
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";

(globalThis as typeof globalThis & { __DEV__: boolean }).__DEV__ = false;
const backMock = jest.fn();
const alertMock = jest.fn();
const createMock = jest.fn(async (_input: unknown) => ({ id: "created-1" }));
const updateMock = jest.fn(async (_input: unknown) => ({ id: "updated-1" }));
const getByIdMock = jest.fn<unknown, []>(() => ({ data: undefined, isLoading: false }));
const refetchMock = jest.fn();
let createOptions: { onSuccess: (data: { id: string }) => Promise<void> };

jest.mock("@repo/api/react", () => ({
  invalidateActivityPlanQueries: jest.fn(async () => undefined),
}));
jest.mock("expo-router", () => ({ __esModule: true, useRouter: () => ({ back: backMock }) }));
jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: alertMock },
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      activityPlans: { list: { invalidate: jest.fn() }, getById: { invalidate: jest.fn() } },
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

import { mapActivityPlanIssueToUiKey, useActivityPlanForm } from "../useActivityPlanForm";

const ids = {
  root: "00000000-0000-4000-8000-000000000001",
  repeat: "00000000-0000-4000-8000-000000000002",
  repeatedStep: "00000000-0000-4000-8000-000000000003",
  finish: "00000000-0000-4000-8000-000000000004",
};
function validStructure(): ActivityPlanDraftStructure {
  return {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: ids.root,
        name: "Warm up",
        duration: { type: "time", seconds: 300 },
        targets: [],
      },
      {
        type: "repeat",
        id: ids.repeat,
        count: 2,
        steps: [
          {
            type: "step",
            id: ids.repeatedStep,
            name: "Steady",
            duration: { type: "time", seconds: 300 },
            targets: [{ type: "%FTP", intensity: 75 }],
          },
        ],
      },
      {
        type: "step",
        id: ids.finish,
        name: "Finish",
        duration: { type: "time", seconds: 300 },
        targets: [{ type: "%FTP", intensity: 70 }],
      },
    ],
  };
}

describe("useActivityPlanForm V5", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getByIdMock.mockReturnValue({ data: undefined, isLoading: false, refetch: refetchMock });
    refetchMock.mockResolvedValue({ data: undefined, isError: true });
    useActivityPlanCreationStore.setState({
      name: "Morning brick",
      description: "",
      activityCategory: "bike",
      structure: { version: 5, activity_category: "bike", items: [] },
    });
  });

  it("retains separate V5 repair locations for incompatible targets", async () => {
    const structure = validStructure();
    const repeat = structure.items[1];
    if (!repeat || repeat.type !== "repeat") throw new Error("missing repeat");
    const repeatedStep = repeat.steps[0];
    if (!repeatedStep) throw new Error("missing repeated step");
    repeatedStep.targets = [
      { type: "watts", intensity: 250 },
      { type: "cadence", intensity: 90 },
    ];
    useActivityPlanCreationStore.setState({
      activityCategory: "strength",
      structure: { ...structure, activity_category: "strength" },
    });
    const { result } = await renderHook(() => useActivityPlanForm());
    expect(result.current.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          intervalId: ids.repeat,
          stepId: ids.repeatedStep,
          targetIndex: 0,
        }),
        expect.objectContaining({
          intervalId: ids.repeat,
          stepId: ids.repeatedStep,
          targetIndex: 1,
        }),
      ]),
    );
  });

  it("single-flights a pending write and retains a rejected draft", async () => {
    useActivityPlanCreationStore.setState({
      structure: validStructure(),
      description: "Keep instructions",
    });
    let reject!: (error: Error) => void;
    createMock.mockReturnValueOnce(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    const { result } = await renderHook(() => useActivityPlanForm());
    await act(() => {
      void result.current.submit();
      void result.current.submit();
    });
    expect(createMock).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error("Write unavailable")));
    expect(result.current.form.description).toBe("Keep instructions");
    expect(result.current.submitError).toBe("Write unavailable");
  });

  it("does not clear a new editor after an old create succeeds", async () => {
    useActivityPlanCreationStore.setState({ structure: validStructure() });
    const view = await renderHook(() => useActivityPlanForm());
    const oldSuccess = createOptions.onSuccess;
    await view.unmount();
    useActivityPlanCreationStore.setState({ name: "New editor draft" });
    await act(async () => oldSuccess({ id: "created-1" }));
    expect(useActivityPlanCreationStore.getState().name).toBe("New editor draft");
  });

  it("rejects an empty root, counts expanded repeat occurrences, and requires a category", async () => {
    const empty = await renderHook(() => useActivityPlanForm());
    expect(empty.result.current.canSubmit).toBe(false);
    expect(Object.values(empty.result.current.validation.errors)[0]).toContain("Too small");
    await empty.unmount();
    useActivityPlanCreationStore.setState({ structure: validStructure() });
    const { result } = await renderHook(() => useActivityPlanForm());
    expect(result.current.metrics.stepCount).toBe(4);
    expect(result.current.metrics.duration).toBe(20);
    await act(async () => {
      useActivityPlanCreationStore.setState({
        activityCategory: null,
        structure: { ...validStructure(), activity_category: null },
      });
    });
    expect(result.current.validation.errors.activity_category).toBeDefined();
  });

  it("maps repeat count and root/repeat step paths to canonical V5 UI keys", () => {
    const structure = validStructure();
    expect(mapActivityPlanIssueToUiKey({ path: ["items", 1, "count"] } as never, structure)).toBe(
      `repeat:${ids.repeat}:count`,
    );
    expect(
      mapActivityPlanIssueToUiKey(
        { path: ["items", 1, "steps", 0, "duration"] } as never,
        structure,
      ),
    ).toBe(`step:${ids.repeatedStep}:duration`);
    expect(mapActivityPlanIssueToUiKey({ path: ["items", 0, "targets"] } as never, structure)).toBe(
      `step:${ids.root}:target`,
    );
  });

  it("submits a strict V5 structure without synthetic fields", async () => {
    useActivityPlanCreationStore.setState({ structure: validStructure() });
    const { result } = await renderHook(() => useActivityPlanForm());
    await act(async () => expect(await result.current.submit()).toEqual({ id: "created-1" }));
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        structure: expect.objectContaining({ version: 5, items: expect.any(Array) }),
      }),
    );
    expect(createMock.mock.calls[0]?.[0]).not.toHaveProperty("routeId");
  });

  it("keeps an editable V5 draft and revision token across reload failures and conflicts", async () => {
    const structure = validStructure();
    const edit = {
      id: "plan-1",
      name: "Existing",
      description: null,
      notes: null,
      structure,
      structureHash: "a".repeat(64),
      activityPlanRevision: 7,
      trainingIntent: "general_maintenance",
      adaptation: null,
      gpsRecordingEnabled: true,
      contentVisibility: "private",
    };
    getByIdMock.mockReturnValue({
      data: { detail: null, edit },
      isLoading: false,
      refetch: refetchMock,
    });
    const { result, rerender } = await renderHook(() => useActivityPlanForm({ planId: "plan-1" }));
    await act(async () => undefined);
    expect(result.current.editStatus).toBe("editable");
    await act(async () => result.current.setName("Keep draft"));
    await act(async () => expect(result.current.reloadFromServer()).resolves.toBe(false));
    expect(result.current.form.name).toBe("Keep draft");
    getByIdMock.mockReturnValue({
      data: { edit: { ...edit, activityPlanRevision: 8 } },
      isLoading: false,
      refetch: refetchMock,
    });
    await rerender({});
    await act(async () => result.current.submit());
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: 7, name: "Keep draft" }),
    );
  });
});
