import { act, renderHook } from "@testing-library/react-native";
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";

(globalThis as typeof globalThis & { __DEV__: boolean }).__DEV__ = false;
const backMock = jest.fn();
const alertMock = jest.fn();
const createMock = jest.fn(async (_input: unknown) => ({ id: "created-1" }));
const updateMock = jest.fn(async (_input: unknown) => ({ id: "updated-1" }));
const getByIdMock = jest.fn(() => ({ data: undefined, isLoading: false }));

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
      create: { useMutation: () => ({ mutateAsync: createMock, isPending: false, error: null }) },
      update: { useMutation: () => ({ mutateAsync: updateMock, isPending: false, error: null }) },
    },
  },
}));

import { useActivityPlanForm } from "../useActivityPlanForm";

const ids = {
  segment: "00000000-0000-4000-8000-000000000001",
  interval: "00000000-0000-4000-8000-000000000002",
  step: "00000000-0000-4000-8000-000000000003",
  transition: "00000000-0000-4000-8000-000000000004",
  segment2: "00000000-0000-4000-8000-000000000005",
  interval2: "00000000-0000-4000-8000-000000000006",
  step2: "00000000-0000-4000-8000-000000000007",
};

function validStructure() {
  return {
    version: 3 as const,
    segments: [
      {
        id: ids.segment,
        role: "activity" as const,
        name: "Bike",
        category: "bike" as const,
        intervals: [
          {
            id: ids.interval,
            name: "Main",
            repetitions: 2,
            steps: [
              {
                id: ids.step,
                name: "Steady",
                duration: { type: "time" as const, seconds: 300 },
                targets: [{ type: "%FTP" as const, intensity: 75 }],
              },
            ],
          },
        ],
      },
      {
        id: ids.transition,
        role: "transition" as const,
        name: "Change",
        duration: { type: "time" as const, seconds: 60 },
      },
      {
        id: ids.segment2,
        role: "activity" as const,
        name: "Bike again",
        category: "bike" as const,
        intervals: [
          {
            id: ids.interval2,
            name: "Finish",
            repetitions: 1,
            steps: [
              {
                id: ids.step2,
                name: "Finish",
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

describe("useActivityPlanForm V3", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useActivityPlanCreationStore.setState({
      name: "Morning brick",
      description: "",
      activityCategory: "bike",
      routeId: null,
      notes: "",
      structure: { version: 3, segments: [] },
    });
  });

  it("rejects a missing V3 segment list", () => {
    const { result } = renderHook(() => useActivityPlanForm());
    expect(result.current.canSubmit).toBe(false);
    expect(Object.values(result.current.validation.errors)[0]).toContain("Too small");
  });

  it("counts compiled repeats and explicit boundary time", () => {
    useActivityPlanCreationStore.setState({ structure: validStructure() });
    const { result } = renderHook(() => useActivityPlanForm());
    expect(result.current.metrics.stepCount).toBe(4);
    expect(result.current.metrics.duration).toBe(16);
  });

  it("maps V3 segment paths to interval and step UI error keys", () => {
    const structure = validStructure();
    const firstActivity = structure.segments[0];
    const secondActivity = structure.segments[2];
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

    const { result } = renderHook(() => useActivityPlanForm());

    expect(result.current.validation.errors[`interval:${ids.interval}:repetitions`]).toBeDefined();
    expect(
      result.current.validation.errors[`step:${ids.interval2}:${ids.step2}:duration`],
    ).toBeDefined();
  });

  it("submits only strict V3 without a synthetic category field", async () => {
    useActivityPlanCreationStore.setState({ structure: validStructure() });
    const { result } = renderHook(() => useActivityPlanForm());
    await act(async () => {
      await expect(result.current.submit()).resolves.toEqual({ id: "created-1" });
    });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ structure: expect.objectContaining({ version: 3 }) }),
    );
    expect(createMock.mock.calls[0]?.[0]).not.toHaveProperty("activity_category");
  });
});
