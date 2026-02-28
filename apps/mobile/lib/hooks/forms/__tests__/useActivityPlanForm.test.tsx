import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";
import React, { useEffect } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActivityPlanForm } from "../useActivityPlanForm";

vi.hoisted(() => {
  (globalThis as any).__DEV__ = false;
});

const {
  backMock,
  alertMock,
  createMutateAsyncMock,
  updateMutateAsyncMock,
  getByIdQueryMock,
} = vi.hoisted(() => ({
  backMock: vi.fn(),
  alertMock: vi.fn(),
  createMutateAsyncMock: vi.fn(async () => ({ id: "created-1" })),
  updateMutateAsyncMock: vi.fn(async () => ({ id: "updated-1" })),
  getByIdQueryMock: vi.fn(() => ({
    data: undefined,
    isLoading: false,
  })),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({
    back: backMock,
  }),
}));

vi.mock("expo-crypto", () => ({
  randomUUID: () => "uuid-mock",
}));

vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native")>();

  return {
    ...actual,
    Alert: {
      ...actual.Alert,
      alert: alertMock,
    },
  };
});

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      activityPlans: {
        list: { invalidate: vi.fn(async () => undefined) },
        getUserPlansCount: { invalidate: vi.fn(async () => undefined) },
        getById: { invalidate: vi.fn(async () => undefined) },
      },
    }),
    activityPlans: {
      getById: {
        useQuery: getByIdQueryMock,
      },
      create: {
        useMutation: vi.fn(() => ({
          mutateAsync: createMutateAsyncMock,
          isPending: false,
          error: null,
        })),
      },
      update: {
        useMutation: vi.fn(() => ({
          mutateAsync: updateMutateAsyncMock,
          isPending: false,
          error: null,
        })),
      },
    },
  },
}));

function HookProbe(props: {
  options?: Parameters<typeof useActivityPlanForm>[0];
  onSnapshot: (snapshot: ReturnType<typeof useActivityPlanForm>) => void;
}) {
  const snapshot = useActivityPlanForm(props.options);

  useEffect(() => {
    props.onSnapshot(snapshot);
  }, [props.onSnapshot, snapshot]);

  return null;
}

describe("useActivityPlanForm", () => {
  beforeEach(() => {
    backMock.mockClear();
    alertMock.mockClear();
    createMutateAsyncMock.mockClear();
    updateMutateAsyncMock.mockClear();
    getByIdQueryMock.mockClear();

    useActivityPlanCreationStore.setState({
      name: "Morning Ride",
      description: "",
      activityCategory: "bike",
      routeId: null,
      notes: "",
      structure: {
        version: 2,
        intervals: [],
      },
    });
  });

  it("enforces strict interval constraints", async () => {
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
          {
            id: "interval-2",
            name: "No steps",
            repetitions: 1,
            steps: [],
          },
        ],
      },
    });

    let snapshot: ReturnType<typeof useActivityPlanForm> | undefined;
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <HookProbe
          onSnapshot={(value) => {
            snapshot = value;
          }}
        />,
      );
    });

    expect(snapshot).toBeDefined();
    expect(snapshot!.validation.errors["interval:interval-1:repetitions"]).toBe(
      "Repeat count must be at least 1.",
    );
    expect(snapshot!.validation.errors["interval:interval-2:steps"]).toBe(
      "Each interval must include at least one step.",
    );
    expect(snapshot!.validation.errors["step:interval-1:step-1:duration"]).toBe(
      "Step duration must be greater than zero (time, distance, or reps).",
    );
    expect(snapshot!.validation.errors["step:interval-1:step-1:target"]).toBe(
      "Set an intensity zone/type target for this step.",
    );

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("gates submit and exposes inline errors before submit", async () => {
    let snapshot: ReturnType<typeof useActivityPlanForm> | undefined;
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <HookProbe
          onSnapshot={(value) => {
            snapshot = value;
          }}
        />,
      );
    });

    expect(snapshot).toBeDefined();
    expect(snapshot!.canSubmit).toBe(false);
    expect(snapshot!.validation.errors.intervals).toBe(
      "Add at least one interval.",
    );

    let submitResult:
      | Awaited<ReturnType<ReturnType<typeof useActivityPlanForm>["submit"]>>
      | undefined;
    await act(async () => {
      submitResult = await snapshot!.submit();
    });

    expect(submitResult).toBeNull();
    expect(createMutateAsyncMock).not.toHaveBeenCalled();
    expect(updateMutateAsyncMock).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledWith(
      "Please Check Your Input",
      "Add at least one interval.",
    );

    await act(async () => {
      renderer?.unmount();
    });
  });
});
