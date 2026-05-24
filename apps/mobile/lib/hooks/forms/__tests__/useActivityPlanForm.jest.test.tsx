import { act, renderHook } from "@testing-library/react-native";
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";

(globalThis as any).__DEV__ = false;

const backMock = jest.fn();
const alertMock = jest.fn();
const formMocks = {
  createMutateAsyncMock: jest.fn(async () => ({ id: "created-1" })),
  updateMutateAsyncMock: jest.fn(async () => ({ id: "updated-1" })),
  getByIdQueryMock: jest.fn((_input?: any, _options?: any) => ({
    data: undefined,
    isLoading: false,
  })),
};

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ back: backMock }),
}));

jest.mock("expo-crypto", () => ({ __esModule: true, randomUUID: () => "uuid-mock" }));

jest.mock("@repo/core", () => ({
  __esModule: true,
  getSaveableActivityPlanStructureIssues: (structure: any) => {
    const issues: Array<{ path: Array<string | number>; message: string }> = [];
    const intervals = structure?.intervals ?? [];

    intervals.forEach((interval: any, intervalIndex: number) => {
      (interval?.steps ?? []).forEach((step: any, stepIndex: number) => {
        if (step?.duration?.type === "untilFinished") {
          issues.push({
            path: ["intervals", intervalIndex, "steps", stepIndex, "duration"],
            message:
              "Saved steps need an explicit time, distance, or repetitions duration. 'Until finished' cannot produce trustworthy IF/TSS.",
          });
        }

        if (!Array.isArray(step?.targets) || step.targets.length === 0) {
          issues.push({
            path: ["intervals", intervalIndex, "steps", stepIndex, "targets"],
            message: "Each saved step needs an intensity target.",
          });
        }
      });
    });

    return issues;
  },
  activityPlanCreateFormSchema: {
    safeParse: (data: any) => {
      const errors: Array<{ path: string[]; message: string }> = [];
      const intervals = data?.structure?.intervals ?? [];

      if (!Array.isArray(intervals) || intervals.length === 0) {
        errors.push({ path: ["intervals"], message: "Add at least one interval." });
      }

      for (const interval of intervals) {
        if ((interval?.repetitions ?? 0) < 1) {
          errors.push({
            path: ["interval", interval.id, "repetitions"],
            message: "Repeat count must be at least 1.",
          });
        }
        if (!Array.isArray(interval?.steps) || interval.steps.length === 0) {
          errors.push({
            path: ["interval", interval.id, "steps"],
            message: "Each interval must include at least one step.",
          });
        }
        for (const step of interval?.steps ?? []) {
          if ((step?.duration?.seconds ?? 0) <= 0) {
            errors.push({
              path: ["step", interval.id, step.id, "duration"],
              message: "Step duration must be greater than zero (time, distance, or reps).",
            });
          }
          if (!Array.isArray(step?.targets) || step.targets.length === 0) {
            errors.push({
              path: ["step", interval.id, step.id, "target"],
              message: "Set an intensity zone/type target for this step.",
            });
          }
        }
      }

      if (errors.length > 0) {
        return {
          success: false,
          error: {
            flatten: () => ({ fieldErrors: {} }),
            issues: errors,
          },
        };
      }

      return { success: true, data };
    },
  },
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
      getById: {
        useQuery: (input?: any, options?: any) => formMocks.getByIdQueryMock(input, options),
      },
      create: {
        useMutation: jest.fn(() => ({
          mutateAsync: formMocks.createMutateAsyncMock,
          isPending: false,
          error: null,
        })),
      },
      update: {
        useMutation: jest.fn(() => ({
          mutateAsync: formMocks.updateMutateAsyncMock,
          isPending: false,
          error: null,
        })),
      },
    },
  },
}));

import { useActivityPlanForm } from "../useActivityPlanForm";

describe("useActivityPlanForm", () => {
  beforeEach(() => {
    backMock.mockClear();
    alertMock.mockClear();
    formMocks.createMutateAsyncMock.mockClear();
    formMocks.updateMutateAsyncMock.mockClear();
    formMocks.getByIdQueryMock.mockClear();

    useActivityPlanCreationStore.setState({
      name: "Morning Ride",
      description: "",
      activityCategory: "bike",
      routeId: null,
      notes: "",
      structure: { version: 2, intervals: [] },
    });
  });

  it("enforces strict interval constraints", () => {
    useActivityPlanCreationStore.setState({
      structure: {
        version: 2,
        intervals: [
          {
            id: "interval-1",
            name: "Bad reps",
            repetitions: 0,
            steps: [
              {
                id: "step-1",
                name: "Zero step",
                duration: { type: "time", seconds: 0 },
                targets: [],
              },
            ],
          },
          { id: "interval-2", name: "No steps", repetitions: 1, steps: [] },
        ],
      },
    });

    const { result, unmount } = renderHook(() => useActivityPlanForm());

    expect(result.current.validation.errors["interval:interval-1:repetitions"]).toBe(
      "Repeat count must be at least 1.",
    );
    expect(result.current.validation.errors["interval:interval-2:steps"]).toBe(
      "Each interval must include at least one step.",
    );
    expect(result.current.validation.errors["step:interval-1:step-1:duration"]).toBe(
      "Step duration must be greater than zero (time, distance, or reps).",
    );
    expect(result.current.validation.errors["step:interval-1:step-1:target"]).toBe(
      "Each saved step needs an intensity target.",
    );

    unmount();
  });

  it("exposes required name and route-only structure errors", () => {
    useActivityPlanCreationStore.setState({
      name: "",
      routeId: "route-1",
      structure: { version: 2, intervals: [] },
    });

    const { result, unmount } = renderHook(() => useActivityPlanForm());

    expect(result.current.validation.errors.name).toBe("Plan name is required.");
    expect(result.current.validation.errors.intervals).toBe("Add at least one interval.");
    expect(result.current.validation.errors.route_id).toBe(
      "This route is attached for context, but you still need structure before this plan can be saved.",
    );
    expect(result.current.canSubmit).toBe(false);

    unmount();
  });

  it("maps invalid duration and missing target to the owning step keys", () => {
    useActivityPlanCreationStore.setState({
      structure: {
        version: 2,
        intervals: [
          {
            id: "interval-1",
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: "step-1",
                name: "Broken step",
                duration: { type: "time", seconds: 0 },
                targets: [],
              },
            ],
          },
        ],
      },
    });

    const { result, unmount } = renderHook(() => useActivityPlanForm());

    expect(result.current.validation.errors["step:interval-1:step-1:duration"]).toBe(
      "Step duration must be greater than zero (time, distance, or reps).",
    );
    expect(result.current.validation.errors["step:interval-1:step-1:target"]).toBe(
      "Each saved step needs an intensity target.",
    );

    unmount();
  });

  it("submits a valid minimal structure", async () => {
    useActivityPlanCreationStore.setState({
      structure: {
        version: 2,
        intervals: [
          {
            id: "interval-1",
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: "step-1",
                name: "Steady",
                duration: { type: "time", seconds: 300 },
                targets: [{ type: "%FTP", intensity: 75 }],
              },
            ],
          },
        ],
      },
    });

    const { result, unmount } = renderHook(() => useActivityPlanForm());

    expect(result.current.validation.isValid).toBe(true);
    expect(result.current.canSubmit).toBe(true);

    let submitResult:
      | Awaited<ReturnType<ReturnType<typeof useActivityPlanForm>["submit"]>>
      | undefined;
    await act(async () => {
      submitResult = await result.current.submit();
    });

    expect(submitResult).toEqual({ id: "created-1" });
    expect(formMocks.createMutateAsyncMock).toHaveBeenCalledWith({
      name: "Morning Ride",
      description: null,
      activity_category: "bike",
      structure: expect.objectContaining({ version: 2 }),
      route_id: null,
      notes: null,
    });

    unmount();
  });

  it("gates submit and exposes inline errors before submit", async () => {
    const { result, unmount } = renderHook(() => useActivityPlanForm());

    expect(result.current.canSubmit).toBe(false);
    expect(result.current.validation.errors.intervals).toBe("Add at least one interval.");

    let submitResult:
      | Awaited<ReturnType<ReturnType<typeof useActivityPlanForm>["submit"]>>
      | undefined;
    await act(async () => {
      submitResult = await result.current.submit();
    });

    expect(submitResult).toBeNull();
    expect(formMocks.createMutateAsyncMock).not.toHaveBeenCalled();
    expect(formMocks.updateMutateAsyncMock).not.toHaveBeenCalled();

    unmount();
  });
});
