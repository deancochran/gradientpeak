import { act, renderHook } from "@testing-library/react-native";

const alertMock = jest.fn();
const applyMutateMock = jest.fn();
const listAppliedSchedulesQueryMock = jest.fn();
const invalidateAppliedSchedulesMock = jest.fn(async () => undefined);
const availablePreview = () => ({
  status: "available" as const,
  applicable: true,
  planRevision: 1,
  planHash: `v1:sha256:${"a".repeat(64)}`,
  basePublishedRevision: null,
  previewFingerprint: `v1:sha256:${"b".repeat(64)}`,
  sessions: [
    {
      sourceSessionId: "11111111-1111-4111-8111-111111111111",
      planningDate: "2026-09-15",
      manifest: {},
    },
  ],
  unresolved: [],
  replacement: null,
});
const previewApplicationMock = jest.fn(async () => availablePreview());
const refetchSchedulesMock = jest.fn();
const refreshScheduleViewsMock = jest.fn(
  async (_queryClient: unknown, _scope: unknown) => undefined,
);
let mutationOptions: {
  onError: (error: { message?: string }) => void;
  onSuccess: (result: { status: "applied"; created: number }) => void;
};

jest.mock("react-native", () => ({
  __esModule: true,
  Alert: { alert: alertMock },
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    trainingPlans: {
      applyApplication: {
        useMutation: (options: typeof mutationOptions) => {
          mutationOptions = options;
          return { isPending: false, mutate: applyMutateMock };
        },
      },
      listAppliedSchedules: {
        useQuery: (input: unknown, options: unknown) =>
          listAppliedSchedulesQueryMock(input, options),
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
  application_id: "11111111-1111-4111-8111-111111111111",
  application_receipt: "11111111-1111-4111-8111-111111111111",
  planning_date: "2026-09-03",
  training_plan_id: planId,
};

function renderController(
  context = { planId, profileId: "profile-1", sourceRevision: "revision-1" },
) {
  return renderHook(() =>
    useTrainingPlanTemplateSchedulingController({
      handleOpenCalendar: jest.fn(),
      ...context,
      queryClient: {} as never,
      router: { navigate: jest.fn(), replace: jest.fn() },
      utils: {
        trainingPlans: {
          listAppliedSchedules: { invalidate: invalidateAppliedSchedulesMock },
          previewApplication: { fetch: previewApplicationMock },
        },
      } as never,
    }),
  );
}

describe("useTrainingPlanTemplateSchedulingController", () => {
  beforeEach(() => {
    alertMock.mockReset();
    applyMutateMock.mockReset();
    listAppliedSchedulesQueryMock.mockReset();
    listAppliedSchedulesQueryMock.mockReturnValue({
      data: { items: [appliedSchedule] },
      isLoading: false,
      error: null,
      refetch: refetchSchedulesMock,
    });
    invalidateAppliedSchedulesMock.mockClear();
    previewApplicationMock.mockReset().mockImplementation(async () => availablePreview());
    refetchSchedulesMock.mockReset();
    refreshScheduleViewsMock.mockClear();
  });

  it("ignores late preview A after changing the date and completing B, and suppresses double review", async () => {
    const a = deferred<ReturnType<typeof availablePreview>>();
    const b = deferred<ReturnType<typeof availablePreview>>();
    previewApplicationMock.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const { result } = await renderController();
    await act(async () => result.current.setTemplateAnchorDate("2026-10-01"));
    await act(async () => {
      result.current.handleApplyTemplate();
      result.current.handleApplyTemplate();
    });
    expect(previewApplicationMock).toHaveBeenCalledTimes(1);
    expect(result.current.previewPending).toBe(true);
    await act(async () => result.current.setTemplateAnchorDate("2026-10-02"));
    await act(async () => result.current.handleApplyTemplate());
    expect(previewApplicationMock).toHaveBeenCalledTimes(2);
    await act(async () => b.resolve(availablePreview()));
    const reviewB = result.current.scheduleReview;
    await act(async () => a.resolve(availablePreview()));
    expect(result.current.scheduleReview).toBe(reviewB);
    expect(result.current.scheduleReview?.request.startDate).toBe("2026-10-02");
  });

  it.each([
    "profileId",
    "planId",
    "sourceRevision",
  ] as const)("rejects a late preview after %s changes", async (field) => {
    const context = { planId, profileId: "profile-1", sourceRevision: "revision-1" };
    const pending = deferred<ReturnType<typeof availablePreview>>();
    previewApplicationMock.mockReturnValueOnce(pending.promise);
    const { result, rerender } = await renderController(context);
    await act(async () => result.current.handleApplyTemplate());
    context[field] = "changed";
    await rerender({});
    await act(async () => pending.resolve(availablePreview()));
    expect(result.current.scheduleReview).toBeNull();
    expect(applyMutateMock).not.toHaveBeenCalled();
  });

  it("retains the date after preview rejection and retries the same read", async () => {
    previewApplicationMock.mockRejectedValueOnce(new Error("Preview unavailable"));
    const { result } = await renderController();
    await act(async () => result.current.setTemplateAnchorDate("2026-10-02"));
    await act(async () => result.current.handleApplyTemplate());
    expect(result.current.scheduleError).toBe("Preview unavailable");
    expect(result.current.templateAnchorDate).toBe("2026-10-02");
    await act(async () => result.current.handleApplyTemplate());
    expect(previewApplicationMock.mock.calls[1]).toEqual(previewApplicationMock.mock.calls[0]);
    expect(result.current.scheduleReview).not.toBeNull();
  });

  it("invalidates a pending review when the selected application changes", async () => {
    const pending = deferred<ReturnType<typeof availablePreview>>();
    previewApplicationMock.mockReturnValueOnce(pending.promise);
    const { result } = await renderController();
    await act(async () => result.current.handleApplyTemplate());
    await act(async () => result.current.setSelectedApplicationId(appliedSchedule.application_id));
    await act(async () => pending.resolve(availablePreview()));
    expect(result.current.scheduleReview).toBeNull();
    expect(result.current.selectedApplicationId).toBe(appliedSchedule.application_id);
    expect(applyMutateMock).not.toHaveBeenCalled();
  });

  it("reads only the viewed plan's applied schedule", async () => {
    const { result } = await renderController();

    expect(listAppliedSchedulesQueryMock).toHaveBeenCalledWith(
      { training_plan_id: planId },
      expect.any(Object),
    );
    expect(result.current.appliedSchedules?.items).toEqual([appliedSchedule]);
  });

  it("reviews then confirms with the exact application-scoped request", async () => {
    const { result } = await renderController();

    await act(async () => {
      result.current.handleApplyTemplate();
      await Promise.resolve();
    });

    expect(applyMutateMock).not.toHaveBeenCalled();
    expect(result.current.scheduleReview?.preview.sessions).toHaveLength(1);

    await act(async () => {
      result.current.handleApplyTemplate();
    });

    expect(applyMutateMock).toHaveBeenCalledWith({
      applicationMode: "full",
      trainingPlanId: planId,
      startDate: undefined,
      targetDate: undefined,
      expectedPlanRevision: 1,
      expectedPlanHash: `v1:sha256:${"a".repeat(64)}`,
      basePublishedRevision: null,
      previewFingerprint: `v1:sha256:${"b".repeat(64)}`,
      operationId: "00000000-0000-4000-8000-000000000000",
    });
    expect(result.current).not.toHaveProperty("showConcurrencyWarning");
    expect(result.current).not.toHaveProperty("handleReplaceScheduledPlan");
  });

  it("refreshes the plan-scoped applied schedule after scheduling", async () => {
    await renderController();

    await act(async () => {
      mutationOptions.onSuccess({ status: "applied", created: 2 });
    });

    expect(invalidateAppliedSchedulesMock).toHaveBeenCalledWith({ training_plan_id: planId });
    expect(refreshScheduleViewsMock).toHaveBeenCalledWith(
      expect.anything(),
      "trainingPlanSchedulingMutation",
    );
  });

  it("updates only the explicitly selected application", async () => {
    const { result } = await renderController();

    await act(async () => {
      result.current.setSelectedApplicationId("11111111-1111-4111-8111-111111111111");
    });
    await act(async () => {
      result.current.handleApplyTemplate();
      await Promise.resolve();
    });
    await act(async () => {
      result.current.handleApplyTemplate();
    });

    expect(applyMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        replacesApplicationId: "11111111-1111-4111-8111-111111111111",
      }),
    );
  });

  it("keeps the reviewed request available after an unknown mutation failure", async () => {
    const { result } = await renderController();

    await act(async () => {
      result.current.handleApplyTemplate();
      await Promise.resolve();
    });
    const review = result.current.scheduleReview;

    await act(async () => {
      result.current.handleApplyTemplate();
      mutationOptions.onError({ message: "Network request failed" });
    });

    expect(result.current.scheduleReview).toEqual(review);
    await act(async () => {
      result.current.setTemplateAnchorDate("2027-01-01");
      result.current.setSelectedApplicationId("another");
    });
    expect(result.current.templateAnchorDate).toBe("");
    expect(result.current.selectedApplicationId).toBe("");
    expect(result.current.inputsLocked).toBe(true);

    await act(async () => {
      result.current.handleApplyTemplate();
    });

    expect(applyMutateMock).toHaveBeenCalledTimes(2);
    expect(applyMutateMock.mock.calls[1]?.[0]).toEqual(applyMutateMock.mock.calls[0]?.[0]);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
