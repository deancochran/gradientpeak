import { act, renderHook } from "@testing-library/react-native";

const alertMock = jest.fn();
const applyMutateMock = jest.fn();
const getAppliedScheduleQueryMock = jest.fn();
const invalidateAppliedScheduleMock = jest.fn(async () => undefined);
const refreshScheduleViewsMock = jest.fn(
  async (_queryClient: unknown, _scope: unknown) => undefined,
);
let mutationOptions: {
  onError: (error: { message?: string }) => void;
  onSuccess: (result: { applied_plan_id?: string; scheduled_sessions_created: number }) => void;
};

jest.mock("react-native", () => ({
  __esModule: true,
  Alert: { alert: alertMock },
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    trainingPlans: {
      applyTemplate: {
        useMutation: (options: typeof mutationOptions) => {
          mutationOptions = options;
          return { isPending: false, mutate: applyMutateMock };
        },
      },
      getAppliedSchedule: {
        useQuery: (input: unknown, options: unknown) => getAppliedScheduleQueryMock(input, options),
      },
    },
  },
}));

jest.mock("@/lib/scheduling/refreshScheduleViews", () => ({
  __esModule: true,
  refreshScheduleViews: (queryClient: unknown, scope: unknown) =>
    refreshScheduleViewsMock(queryClient, scope),
}));

import { useTrainingPlanTemplateSchedulingController } from "../useTrainingPlanTemplateSchedulingController";

const planId = "11111111-1111-4111-8111-111111111111";
const appliedSchedule = {
  schedule_batch_id: "33333333-3333-4333-8333-333333333333",
  starts_at: "2026-09-03T06:00:00.000Z",
  training_plan_id: planId,
};

function renderController() {
  return renderHook(() =>
    useTrainingPlanTemplateSchedulingController({
      handleOpenCalendar: jest.fn(),
      planId,
      queryClient: {} as never,
      router: { navigate: jest.fn(), replace: jest.fn() },
      utils: {
        trainingPlans: {
          getAppliedSchedule: { invalidate: invalidateAppliedScheduleMock },
        },
      } as never,
    }),
  );
}

describe("useTrainingPlanTemplateSchedulingController", () => {
  beforeEach(() => {
    alertMock.mockReset();
    applyMutateMock.mockReset();
    getAppliedScheduleQueryMock.mockReset();
    getAppliedScheduleQueryMock.mockReturnValue({ data: appliedSchedule });
    invalidateAppliedScheduleMock.mockClear();
    refreshScheduleViewsMock.mockClear();
  });

  it("reads only the viewed plan's applied schedule", async () => {
    const { result } = await renderController();

    expect(getAppliedScheduleQueryMock).toHaveBeenCalledWith(
      { training_plan_id: planId },
      expect.any(Object),
    );
    expect(result.current.appliedSchedule).toEqual(appliedSchedule);
  });

  it("applies directly without requesting global replacement", async () => {
    const { result } = await renderController();

    await act(() => {
      result.current.handleApplyTemplate();
    });

    expect(applyMutateMock).toHaveBeenCalledWith({
      application_mode: "full",
      start_date: undefined,
      target_date: undefined,
      template_id: planId,
      template_type: "training_plan",
    });
    expect(result.current).not.toHaveProperty("showConcurrencyWarning");
    expect(result.current).not.toHaveProperty("handleReplaceScheduledPlan");
  });

  it("refreshes the plan-scoped applied schedule after scheduling", async () => {
    await renderController();

    await act(async () => {
      mutationOptions.onSuccess({ scheduled_sessions_created: 2 });
    });

    expect(invalidateAppliedScheduleMock).toHaveBeenCalledWith({ training_plan_id: planId });
    expect(refreshScheduleViewsMock).toHaveBeenCalledWith(
      expect.anything(),
      "trainingPlanSchedulingMutation",
    );
  });
});
