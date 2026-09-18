// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrainingPlanDetail } from "./training-plan-detail";

const mocks = vi.hoisted(() => ({
  mutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  profileId: "profile-1",
  schedulesError: null as Error | null,
  schedulesRefetch: vi.fn(),
  linkedError: null as Error | null,
  linkedRefetch: vi.fn(),
  invalidate: vi.fn(),
  planRefetch: vi.fn(),
  appliedSchedules: [] as Array<{
    application_id: string;
    eligible_future_count: number;
    source_revision: number;
    start_date: string;
  }>,
  plan: {
    id: "plan-1",
    profile_id: "profile-1",
    name: "Base plan",
    description: null,
    structure_hash: "hash",
    structure: {
      version: 1,
      activity_category: ["bike"],
      durationWeeks: { recommended: 2 },
      goal_blueprints: [
        {
          title: "Goal day",
          priority: 10,
          activity_category: "bike",
          target_offset_days: 8,
        },
      ],
      sessions: [
        {
          offset_days: 0,
          activity_plan_id: "11111111-1111-4111-8111-111111111111",
        },
        {
          offset_days: 8,
          activity_plan_id: "22222222-2222-4222-8222-222222222222",
        },
      ],
    },
    is_system_template: false,
    content_visibility: "private",
    editor: {
      revision: 1,
      structureHash: `v1:sha256:${"a".repeat(64)}`,
      validation: { status: "current" },
    },
  },
  applyApplicationMutation: vi.fn(),
  commitMutation: vi.fn(),
  removeAppliedScheduleMutation: vi.fn(),
  preview: vi.fn(),
  previewApplication: vi.fn(),
  previewRemoveAppliedSchedule: vi.fn(),
}));

vi.mock("../../lib/api/client", () => ({
  api: {
    useUtils: () => ({
      trainingPlans: {
        invalidate: mocks.invalidate,
        preview: { fetch: mocks.preview },
        previewApplication: { fetch: mocks.previewApplication },
        previewRemoveAppliedSchedule: { fetch: mocks.previewRemoveAppliedSchedule },
      },
    }),
    profiles: { get: { useQuery: () => ({ data: { id: mocks.profileId } }) } },
    trainingPlans: {
      get: {
        useQuery: () => ({
          data: mocks.plan,
          error: null,
          isLoading: false,
          refetch: mocks.planRefetch,
        }),
      },
      listAppliedSchedules: {
        useQuery: () => ({
          data: { items: mocks.appliedSchedules },
          isLoading: false,
          error: mocks.schedulesError,
          refetch: mocks.schedulesRefetch,
        }),
      },
      commit: { useMutation: () => ({ isPending: false, mutateAsync: mocks.commitMutation }) },
      removeAppliedSchedule: {
        useMutation: () => ({ isPending: false, mutateAsync: mocks.removeAppliedScheduleMutation }),
      },
      applyApplication: {
        useMutation: () => ({ isPending: false, mutateAsync: mocks.applyApplicationMutation }),
      },
      delete: { useMutation: mocks.mutation },
    },
    activityPlans: {
      getManyByIds: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                name: "Linked ride",
                description: "Ride details",
              },
            ],
          },
          error: mocks.linkedError,
          isLoading: false,
          refetch: mocks.linkedRefetch,
        }),
      },
    },
    social: { toggleLike: { useMutation: mocks.mutation } },
  },
}));

describe("TrainingPlanDetail", () => {
  it("offers the canonical editor and linked read view without definition controls", () => {
    const onEdit = vi.fn();
    render(
      <TrainingPlanDetail
        planId="plan-1"
        onEdit={onEdit}
        onDeleted={vi.fn()}
        onOpenDuplicate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "public" })).toBeNull();
    expect(screen.queryByRole("button", { name: "followers" })).toBeNull();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Activities" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByRole("link", { name: "Linked ride" }).getAttribute("href")).toBe(
      "/activity-plans/11111111-1111-4111-8111-111111111111",
    );
    expect(mocks.commitMutation).not.toHaveBeenCalled();
  });
  afterEach(() => {
    cleanup();
    mocks.appliedSchedules = [];
    mocks.profileId = "profile-1";
    mocks.plan.id = "plan-1";
    mocks.plan.editor.revision = 1;
    mocks.schedulesError = null;
    mocks.linkedError = null;
    mocks.schedulesRefetch.mockReset();
    mocks.linkedRefetch.mockReset();
    mocks.invalidate.mockReset();
    mocks.planRefetch.mockReset();
    mocks.applyApplicationMutation.mockReset();
    mocks.commitMutation.mockReset();
    mocks.removeAppliedScheduleMutation.mockReset();
    mocks.previewApplication.mockReset();
    mocks.preview.mockReset();
    mocks.previewRemoveAppliedSchedule.mockReset();
  });

  it("invalidates preview A synchronously, allows B, and ignores A's late response", async () => {
    const a = deferred<ReturnType<typeof schedulePreview>>();
    const b = deferred<ReturnType<typeof schedulePreview>>();
    mocks.previewApplication.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    render(detail());
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Review schedule" }));
    fireEvent.click(screen.getByRole("button", { name: "Review schedule" }));
    expect(mocks.previewApplication).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("Preparing");
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-10-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Review schedule" }));
    expect(mocks.previewApplication).toHaveBeenCalledTimes(2);
    await act(async () => b.resolve(schedulePreview("2026-10-02")));
    await act(async () => a.resolve(schedulePreview("2026-10-01")));
    expect(screen.getByText(/beginning on 2026-10-02/)).toBeTruthy();
    expect(screen.queryByText(/beginning on 2026-10-01/)).toBeNull();
    mocks.applyApplicationMutation.mockResolvedValue({ status: "applied" });
    fireEvent.click(screen.getByRole("button", { name: "Confirm schedule" }));
    await waitFor(() =>
      expect(mocks.applyApplicationMutation).toHaveBeenCalledWith(
        expect.objectContaining({ startDate: "2026-10-02" }),
      ),
    );
  });

  it.each([
    "account",
    "plan",
    "source",
  ] as const)("rejects late previews after %s context changes", async (kind) => {
    const pending = deferred<ReturnType<typeof schedulePreview>>();
    mocks.previewApplication.mockReturnValue(pending.promise);
    const view = render(detail());
    fireEvent.click(screen.getByRole("button", { name: "Review schedule" }));
    if (kind === "account") mocks.profileId = "profile-2";
    if (kind === "plan") mocks.plan.id = "plan-2";
    if (kind === "source") mocks.plan.editor.revision = 2;
    view.rerender(detail(kind === "plan" ? "plan-2" : "plan-1"));
    await act(async () => pending.resolve(schedulePreview("2026-10-01")));
    expect(screen.queryByRole("button", { name: "Confirm schedule" })).toBeNull();
    expect(mocks.applyApplicationMutation).not.toHaveBeenCalled();
  });

  it("retains inputs after preview failure and retries the read without mutating", async () => {
    mocks.previewApplication
      .mockRejectedValueOnce(new Error("Preview offline"))
      .mockResolvedValueOnce(schedulePreview("2026-10-02"));
    render(detail());
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-10-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Review schedule" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Preview offline");
    expect((screen.getByLabelText("Start date") as HTMLInputElement).value).toBe("2026-10-02");
    fireEvent.click(screen.getByRole("button", { name: "Review schedule" }));
    await screen.findByRole("button", { name: "Confirm schedule" });
    expect(mocks.previewApplication.mock.calls[1]?.[0]).toEqual(
      mocks.previewApplication.mock.calls[0]?.[0],
    );
    expect(mocks.applyApplicationMutation).not.toHaveBeenCalled();
  });

  it("invalidates a pending review when the application selection changes", async () => {
    const applicationId = "11111111-1111-4111-8111-111111111111";
    mocks.appliedSchedules = [
      {
        application_id: applicationId,
        eligible_future_count: 1,
        source_revision: 1,
        start_date: "2026-10-01",
      },
    ];
    const pending = deferred<ReturnType<typeof schedulePreview>>();
    mocks.previewApplication.mockReturnValueOnce(pending.promise);
    render(detail());
    fireEvent.click(screen.getByRole("button", { name: "Review schedule" }));
    fireEvent.change(screen.getByLabelText("Scheduled application"), {
      target: { value: applicationId },
    });
    await act(async () => pending.resolve(schedulePreview("2026-10-01")));
    expect(screen.queryByRole("button", { name: "Confirm schedule" })).toBeNull();
    expect((screen.getByLabelText("Scheduled application") as HTMLSelectElement).value).toBe(
      applicationId,
    );
  });

  it("shows applied-schedule errors and retries without clearing the date", () => {
    mocks.schedulesError = new Error("Schedule offline");
    render(detail());
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-10-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Retry scheduled applications" }));
    expect(mocks.schedulesRefetch).toHaveBeenCalledOnce();
    expect((screen.getByLabelText("Start date") as HTMLInputElement).value).toBe("2026-10-02");
  });

  it("retains an uncertain removal request even if refreshed applications no longer contain it", async () => {
    const applicationId = "11111111-1111-4111-8111-111111111111";
    mocks.appliedSchedules = [
      {
        application_id: applicationId,
        eligible_future_count: 1,
        source_revision: 1,
        start_date: "2026-10-01",
      },
    ];
    mocks.previewRemoveAppliedSchedule.mockResolvedValue({
      applicationId,
      previewFingerprint: "removal-fingerprint",
      affected: [],
    });
    mocks.removeAppliedScheduleMutation
      .mockRejectedValueOnce(new Error("Removal response lost"))
      .mockResolvedValueOnce({ success: true });
    const view = render(detail());
    fireEvent.change(screen.getByLabelText("Scheduled application"), {
      target: { value: applicationId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review schedule removal" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm remove schedule" }));
    await screen.findByText("Removal response lost");
    const frozen = mocks.removeAppliedScheduleMutation.mock.calls[0]?.[0];
    mocks.appliedSchedules = [];
    view.rerender(detail());
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove schedule" }));
    await waitFor(() => expect(mocks.removeAppliedScheduleMutation).toHaveBeenCalledTimes(2));
    expect(mocks.removeAppliedScheduleMutation.mock.calls[1]?.[0]).toEqual(frozen);
  });

  it("keeps committed scheduling distinct from failed cache refresh and retries reads only", async () => {
    mocks.previewApplication.mockResolvedValue(schedulePreview("2026-10-02"));
    mocks.applyApplicationMutation.mockResolvedValue({ status: "applied" });
    mocks.invalidate.mockRejectedValueOnce(new Error("Cache offline"));
    render(detail());
    fireEvent.click(screen.getByRole("button", { name: "Review schedule" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm schedule" }));
    await screen.findByText("Plan scheduled. The latest data could not be refreshed.");
    expect(screen.queryByRole("button", { name: "Confirm schedule" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Refresh plan" }));
    expect(mocks.planRefetch).toHaveBeenCalledOnce();
    expect(mocks.schedulesRefetch).toHaveBeenCalledOnce();
    expect(mocks.applyApplicationMutation).toHaveBeenCalledOnce();
  });

  it("releases a removal review on an authoritative conflict so it can be reviewed again", async () => {
    const applicationId = "11111111-1111-4111-8111-111111111111";
    mocks.appliedSchedules = [
      {
        application_id: applicationId,
        eligible_future_count: 1,
        source_revision: 1,
        start_date: "2026-10-01",
      },
    ];
    mocks.previewRemoveAppliedSchedule.mockResolvedValue({
      applicationId,
      previewFingerprint: "removal-fingerprint",
      affected: [],
    });
    mocks.removeAppliedScheduleMutation.mockRejectedValueOnce(
      Object.assign(new Error("Review expired"), { data: { code: "CONFLICT" } }),
    );
    render(detail());
    fireEvent.change(screen.getByLabelText("Scheduled application"), {
      target: { value: applicationId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review schedule removal" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm remove schedule" }));
    await screen.findByText("Review expired");
    expect(screen.getByRole("button", { name: "Review schedule removal" })).toBeTruthy();
    expect((screen.getByLabelText("Start date") as HTMLInputElement).disabled).toBe(false);
  });

  it("shows the authoritative projection status", () => {
    render(
      <TrainingPlanDetail
        planId="plan-1"
        onDeleted={vi.fn()}
        onEdit={vi.fn()}
        onOpenDuplicate={vi.fn()}
      />,
    );
    expect(screen.getByText("Projection status")).toBeTruthy();
    expect(screen.getByText("current")).toBeTruthy();
  });

  it("retries a duplicate with the exact retained payload after a lost response", async () => {
    mocks.preview.mockResolvedValue({
      status: "available",
      basePublishedRevision: 4,
      previewFingerprint: `v1:sha256:${"e".repeat(64)}`,
    });
    mocks.commitMutation
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce({ status: "saved", planId: "copy-1" });
    const onOpenDuplicate = vi.fn();
    render(
      <TrainingPlanDetail
        planId="plan-1"
        onDeleted={vi.fn()}
        onEdit={vi.fn()}
        onOpenDuplicate={onOpenDuplicate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    await screen.findByText("Network request failed");
    const firstPayload = mocks.commitMutation.mock.calls[0]?.[0];
    expect(mocks.preview).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    await waitFor(() => expect(onOpenDuplicate).toHaveBeenCalledWith("copy-1"));
    expect(mocks.commitMutation.mock.calls[1]?.[0]).toBe(firstPayload);
    expect(mocks.preview).toHaveBeenCalledTimes(1);
  });

  it("reviews then applies the exact reviewed schedule request", async () => {
    mocks.previewApplication.mockResolvedValue({
      status: "available",
      planRevision: 2,
      planHash: `v1:sha256:${"b".repeat(64)}`,
      basePublishedRevision: 3,
      previewFingerprint: `v1:sha256:${"c".repeat(64)}`,
      applicable: true,
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
    mocks.applyApplicationMutation.mockResolvedValue({ status: "applied" });

    render(
      <TrainingPlanDetail
        planId="plan-1"
        onDeleted={vi.fn()}
        onEdit={vi.fn()}
        onOpenDuplicate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Review schedule" }));

    expect(await screen.findByText(/1 sessions beginning on 2026-09-15/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Confirm schedule" }));

    await waitFor(() =>
      expect(mocks.applyApplicationMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          trainingPlanId: "plan-1",
          applicationMode: "full",
          startDate: expect.any(String),
          expectedPlanRevision: 2,
          expectedPlanHash: `v1:sha256:${"b".repeat(64)}`,
          basePublishedRevision: 3,
          previewFingerprint: `v1:sha256:${"c".repeat(64)}`,
          operationId: expect.any(String),
        }),
      ),
    );
  });

  it("keeps the reviewed apply payload available after an unknown mutation failure", async () => {
    mocks.previewApplication.mockResolvedValue({
      status: "available",
      planRevision: 2,
      planHash: `v1:sha256:${"b".repeat(64)}`,
      basePublishedRevision: 3,
      previewFingerprint: `v1:sha256:${"c".repeat(64)}`,
      applicable: true,
      sessions: [],
      unresolved: [],
      replacement: null,
    });
    mocks.applyApplicationMutation
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce({ status: "applied" });

    render(
      <TrainingPlanDetail
        planId="plan-1"
        onDeleted={vi.fn()}
        onEdit={vi.fn()}
        onOpenDuplicate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Review schedule" }));
    await screen.findByRole("button", { name: "Confirm schedule" });

    fireEvent.click(screen.getByRole("button", { name: "Confirm schedule" }));
    await screen.findByText("Network request failed");
    expect((screen.getByLabelText("Start date") as HTMLInputElement).disabled).toBe(true);
    const originalDate = (screen.getByLabelText("Start date") as HTMLInputElement).value;
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2027-01-01" } });
    expect((screen.getByLabelText("Start date") as HTMLInputElement).value).toBe(originalDate);
    fireEvent.click(screen.getByRole("button", { name: "Confirm schedule" }));

    await waitFor(() => expect(mocks.applyApplicationMutation).toHaveBeenCalledTimes(2));
    expect(mocks.applyApplicationMutation.mock.calls[1]?.[0]).toEqual(
      mocks.applyApplicationMutation.mock.calls[0]?.[0],
    );
  });

  it("reviews then removes the selected application with its reviewed fingerprint", async () => {
    mocks.appliedSchedules = [
      {
        application_id: "22222222-2222-4222-8222-222222222222",
        eligible_future_count: 1,
        source_revision: 1,
        start_date: "2026-09-01",
      },
      {
        application_id: "33333333-3333-4333-8333-333333333333",
        eligible_future_count: 1,
        source_revision: 2,
        start_date: "2026-09-08",
      },
    ];
    mocks.previewRemoveAppliedSchedule.mockResolvedValue({
      status: "available",
      applicationId: "33333333-3333-4333-8333-333333333333",
      applicationRevision: 1,
      affected: [{ id: "44444444-4444-4444-8444-444444444444", sessionRevision: 1 }],
      protected: [],
      cutoffDate: "2026-09-14",
      previewFingerprint: `v1:sha256:${"d".repeat(64)}`,
    });
    mocks.removeAppliedScheduleMutation.mockResolvedValue({ success: true });

    render(
      <TrainingPlanDetail
        planId="plan-1"
        onDeleted={vi.fn()}
        onEdit={vi.fn()}
        onOpenDuplicate={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Scheduled application"), {
      target: { value: "33333333-3333-4333-8333-333333333333" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review schedule removal" }));

    expect(await screen.findByText(/affects 1 future scheduled sessions/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Confirm remove schedule" }));

    await waitFor(() =>
      expect(mocks.removeAppliedScheduleMutation).toHaveBeenCalledWith({
        applicationId: "33333333-3333-4333-8333-333333333333",
        operationId: expect.any(String),
        previewFingerprint: `v1:sha256:${"d".repeat(64)}`,
      }),
    );
  });
});

function detail(planId = "plan-1") {
  return (
    <TrainingPlanDetail
      planId={planId}
      onDeleted={vi.fn()}
      onEdit={vi.fn()}
      onOpenDuplicate={vi.fn()}
    />
  );
}
function schedulePreview(date: string) {
  return {
    status: "available",
    applicable: true,
    planRevision: 1,
    planHash: "hash",
    basePublishedRevision: 1,
    previewFingerprint: date,
    sessions: [{ planningDate: date }],
    unresolved: [],
    replacement: null,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
