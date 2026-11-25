// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionScenarioPreview } from "./session-scenario-preview";

const mocks = vi.hoisted(() => ({
  alternativeInputs: [] as unknown[],
  fetchNextPage: vi.fn(),
  previewInputs: [] as unknown[],
  previewInput: undefined as unknown,
  apply: vi.fn(),
  actorId: "00000000-0000-4000-8000-000000000001",
  invalidations: {
    activityPlans: vi.fn(async () => undefined),
    calendar: vi.fn(async () => undefined),
    ledger: vi.fn(async () => undefined),
    plannedSessions: vi.fn(async () => undefined),
    state: vi.fn(async () => undefined),
  },
  previewResult: {
    data: undefined as unknown,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  stateResult: {
    data: { publishedState: { baseline: { stateRevision: 7 } } },
    isSuccess: true,
  },
}));

vi.mock("../../lib/api/client", () => ({
  api: {
    useUtils: () => ({
      athleteIntelligence: { getReadModel: { invalidate: mocks.invalidations.state } },
      activityPlans: { invalidate: mocks.invalidations.activityPlans },
      calendar: { invalidate: mocks.invalidations.calendar },
      plannedSessions: { invalidate: mocks.invalidations.plannedSessions },
      trainingPlans: { getPlanningLedger: { invalidate: mocks.invalidations.ledger } },
    }),
    activityPlans: {
      list: {
        useInfiniteQuery: (input: unknown) => {
          mocks.alternativeInputs.push(input);
          return {
            data: { pages: [{ items: [{ id: "substitute", name: "Substitute plan" }] }] },
            fetchNextPage: mocks.fetchNextPage,
            hasNextPage: false,
            isError: false,
            isFetchingNextPage: false,
            refetch: vi.fn(),
          };
        },
      },
    },
    athleteIntelligence: { getReadModel: { useQuery: () => mocks.stateResult } },
    plannedSessions: {
      previewScenario: {
        useQuery: (input: unknown) => {
          mocks.previewInput = input;
          mocks.previewInputs.push(input);
          return mocks.previewResult;
        },
      },
      applyScenario: {
        useMutation: () => ({ isPending: false, mutateAsync: mocks.apply }),
      },
    },
  },
}));

vi.mock("../providers/auth-provider", () => ({
  useAuth: () => ({ user: mocks.actorId ? { id: mocks.actorId } : null }),
}));

vi.mock("@repo/ui/components/session-scenario-comparison", () => ({
  SessionScenarioComparison: () => <div data-testid="scenario-chart" />,
}));

afterEach(cleanup);
beforeEach(() => {
  mocks.alternativeInputs = [];
  mocks.fetchNextPage = vi.fn();
  mocks.previewInput = undefined;
  mocks.previewInputs = [];
  mocks.apply = vi.fn();
  mocks.actorId = "00000000-0000-4000-8000-000000000001";
  Object.values(mocks.invalidations).forEach((invalidate) => {
    invalidate.mockReset();
    invalidate.mockResolvedValue(undefined);
  });
  mocks.previewResult = { data: undefined, isError: false, isLoading: false, refetch: vi.fn() };
  mocks.stateResult = {
    data: { publishedState: { baseline: { stateRevision: 7 } } },
    isSuccess: true,
  };
});

const session = {
  activityPlanId: "current-plan",
  id: "session-a",
  profileId: "profile-a",
  sessionRevision: 3,
};
const activityPlan = { detail: { activityPlanRevision: 5 } };

function renderPreview(nextSession = session) {
  return render(
    <SessionScenarioPreview activityPlan={activityPlan} session={nextSession} timeZone="UTC" />,
  );
}

function inputScenario() {
  return (mocks.previewInput as { scenario?: unknown } | undefined)?.scenario;
}

function availablePreview() {
  return {
    status: "available" as const,
    previewFingerprint: `v1:sha256:${"a".repeat(64)}`,
    selectedSession: { id: "session-a", sessionRevision: 3, planningDate: "2026-11-26" },
    stateRevision: 7,
    freshness: "fresh" as const,
    horizon: { startDate: "2026-11-26", simulationAt: "2026-11-25T00:00:00.000Z", sessionCount: 2 },
    scenario: { kind: "as_planned" as const },
    baseline: {},
    alternative: {},
    provenance: {
      resolution: "current_activity_plan" as const,
      selectedPlan: { id: "current-plan", revision: 5 },
      historicalSnapshots: "provenance_only" as const,
      selectedAlternative: null,
    },
  };
}

describe("SessionScenarioPreview", () => {
  it("sends all five canonical read-only scenario inputs with actual revisions", () => {
    renderPreview();
    expect(inputScenario()).toEqual({ kind: "as_planned" });
    expect(mocks.alternativeInputs.at(-1)).toEqual({ ownerScope: "all", limit: 25 });

    fireEvent.click(screen.getByRole("button", { name: "less" }));
    fireEvent.change(screen.getByLabelText("Target duration (seconds)"), {
      target: { value: "1800" },
    });
    expect(inputScenario()).toEqual({ kind: "less", targetDurationSeconds: 1800 });

    fireEvent.click(screen.getByRole("button", { name: "more" }));
    fireEvent.change(screen.getByLabelText("Target duration (seconds)"), {
      target: { value: "5400" },
    });
    expect(inputScenario()).toEqual({ kind: "more", targetDurationSeconds: 5400 });

    fireEvent.click(screen.getByRole("button", { name: "substitute" }));
    fireEvent.change(screen.getByLabelText("Substitute activity plan"), {
      target: { value: "substitute" },
    });
    expect(inputScenario()).toEqual({ kind: "substitute", activityPlanId: "substitute" });

    fireEvent.click(screen.getByRole("button", { name: "skip" }));
    expect(inputScenario()).toEqual({ kind: "skip" });
    expect(mocks.previewInput).toMatchObject({
      expectedPlanRevision: 5,
      expectedSessionRevision: 3,
      expectedStateRevision: 7,
      sessionId: "session-a",
    });
  });

  it("keeps an invalid duration draft visible and does not issue a malformed preview", () => {
    renderPreview();
    fireEvent.click(screen.getByRole("button", { name: "less" }));
    fireEvent.change(screen.getByLabelText("Target duration (seconds)"), {
      target: { value: "0" },
    });

    expect(screen.getByDisplayValue("0")).toBeTruthy();
    expect(screen.getByText(/Enter a positive target duration/)).toBeTruthy();
    expect(inputScenario()).toBeUndefined();
  });

  it("renders unavailable, stale, and retryable error states without a write API", () => {
    mocks.previewResult.data = { status: "unavailable", reason: "baseline_unavailable" };
    const { rerender } = renderPreview();
    expect(screen.getByText(/baseline unavailable/)).toBeTruthy();

    mocks.previewResult.data = {
      status: "stale",
      reason: "state_revision",
      currentSessionRevision: 3,
      currentPlanRevision: 5,
      currentStateRevision: 8,
    };
    rerender(
      <SessionScenarioPreview activityPlan={activityPlan} session={session} timeZone="UTC" />,
    );
    expect(screen.getByText(/state revision changed/)).toBeTruthy();

    mocks.previewResult = { data: undefined, isError: true, isLoading: false, refetch: vi.fn() };
    rerender(
      <SessionScenarioPreview activityPlan={activityPlan} session={session} timeZone="UTC" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry comparison" }));
    expect(mocks.previewResult.refetch).toHaveBeenCalledOnce();
  });

  it("resets its draft when the selected session changes, fencing an old scenario response", () => {
    const { rerender } = renderPreview();
    fireEvent.click(screen.getByRole("button", { name: "more" }));
    fireEvent.change(screen.getByLabelText("Target duration (seconds)"), {
      target: { value: "5400" },
    });
    rerender(
      <SessionScenarioPreview
        activityPlan={activityPlan}
        session={{ ...session, id: "session-b", sessionRevision: 4 }}
        timeZone="UTC"
      />,
    );
    expect(inputScenario()).toEqual({ kind: "as_planned" });
    expect(screen.queryByDisplayValue("5400")).toBeNull();
    expect(mocks.previewInputs).not.toContainEqual({
      expectedPlanRevision: 5,
      expectedSessionRevision: 4,
      expectedStateRevision: 7,
      scenario: { kind: "more", targetDurationSeconds: 5400 },
      sessionId: "session-b",
    });
  });

  it("freezes a confirmed available preview and retries an unknown result with the same operation", async () => {
    mocks.previewResult.data = {
      status: "available",
      previewFingerprint: `v1:sha256:${"a".repeat(64)}`,
      selectedSession: { id: "session-a", sessionRevision: 3, planningDate: "2026-11-26" },
      stateRevision: 7,
      freshness: "fresh",
      horizon: {
        startDate: "2026-11-26",
        simulationAt: "2026-11-25T00:00:00.000Z",
        sessionCount: 2,
      },
      scenario: { kind: "as_planned" },
      baseline: {},
      alternative: {},
      provenance: {
        resolution: "current_activity_plan",
        selectedPlan: { id: "current-plan", revision: 5 },
        historicalSnapshots: "provenance_only",
        selectedAlternative: null,
      },
    };
    mocks.apply
      .mockRejectedValueOnce(new Error("lost acknowledgement"))
      .mockResolvedValueOnce({ status: "applied", action: "unchanged" });
    const { rerender } = renderPreview();

    fireEvent.click(screen.getByRole("button", { name: "Apply this scenario" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm apply" }));
    await screen.findByText(/could not confirm whether/i);
    mocks.previewResult.data = { status: "unavailable", reason: "session_not_scheduled" };
    rerender(
      <SessionScenarioPreview activityPlan={activityPlan} session={session} timeZone="UTC" />,
    );
    expect(screen.getByRole("button", { name: "Check or retry this change" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check or retry this change" }));
    await screen.findByText(/Applied: unchanged/i);
    expect(mocks.apply).toHaveBeenCalledTimes(2);
    const firstRequest = mocks.apply.mock.calls[0]?.[0];
    const retryRequest = mocks.apply.mock.calls[1]?.[0];
    if (!firstRequest || !retryRequest) throw new Error("Expected both apply attempts.");
    expect(firstRequest).toEqual(retryRequest);
  });

  it("fails closed when browser recovery storage cannot durably arm an operation", async () => {
    mocks.previewResult.data = {
      status: "available",
      previewFingerprint: `v1:sha256:${"a".repeat(64)}`,
      selectedSession: { id: "session-a", sessionRevision: 3, planningDate: "2026-11-26" },
      stateRevision: 7,
      freshness: "fresh",
      horizon: {
        startDate: "2026-11-26",
        simulationAt: "2026-11-25T00:00:00.000Z",
        sessionCount: 2,
      },
      scenario: { kind: "as_planned" },
      baseline: {},
      alternative: {},
      provenance: {
        resolution: "current_activity_plan",
        selectedPlan: { id: "current-plan", revision: 5 },
        historicalSnapshots: "provenance_only",
        selectedAlternative: null,
      },
    };
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded");
    });
    renderPreview();
    fireEvent.click(screen.getByRole("button", { name: "Apply this scenario" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm apply" }));
    expect(screen.getByText(/Unable to save safe recovery/i)).toBeTruthy();
    expect(mocks.apply).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it("persists and submits one frozen operation from a double confirmation", async () => {
    mocks.previewResult.data = availablePreview();
    let resolveApply: (value: unknown) => void = () => undefined;
    mocks.apply.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApply = resolve;
        }),
    );
    renderPreview();
    fireEvent.click(screen.getByRole("button", { name: "Apply this scenario" }));
    const confirm = screen.getByRole("button", { name: "Confirm apply" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledOnce());
    expect(mocks.apply.mock.calls[0]?.[0]).toMatchObject({
      expectedPreviewFingerprint: `v1:sha256:${"a".repeat(64)}`,
      preview: expect.objectContaining({ sessionId: "session-a" }),
    });
    resolveApply({ status: "applied", action: "unchanged" });
  });

  it("does not settle an old actor's late acknowledgement into a replacement actor", async () => {
    mocks.previewResult.data = availablePreview();
    let resolveApply: (value: unknown) => void = () => undefined;
    mocks.apply.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApply = resolve;
        }),
    );
    const { rerender } = renderPreview();
    fireEvent.click(screen.getByRole("button", { name: "Apply this scenario" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm apply" }));
    fireEvent.click(screen.getByRole("button", { name: "Check or retry this change" }));
    const actorAKey = "gradientpeak:planned-session-scenario:v1:profile-a:session-a";
    expect(localStorage.getItem(actorAKey)).not.toBeNull();

    mocks.actorId = "00000000-0000-4000-8000-000000000002";
    rerender(
      <SessionScenarioPreview activityPlan={activityPlan} session={session} timeZone="UTC" />,
    );
    resolveApply({ status: "applied", action: "unchanged" });
    await Promise.resolve();
    expect(screen.queryByText(/Applied: unchanged/i)).toBeNull();
    expect(localStorage.getItem(actorAKey)).not.toBeNull();
  });

  it("invalidates the mounted planning ledger after a durable apply", async () => {
    mocks.previewResult.data = availablePreview();
    mocks.apply.mockResolvedValue({ status: "applied", action: "repointed" });
    renderPreview();
    fireEvent.click(screen.getByRole("button", { name: "Apply this scenario" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm apply" }));

    await screen.findByText(/Applied: repointed. The durable session result is now shown./i);
    expect(mocks.invalidations.ledger).toHaveBeenCalledOnce();
  });

  it("does not show actor A's stale result or refetch actor B's preview after invalidation", async () => {
    mocks.previewResult.data = availablePreview();
    mocks.apply.mockResolvedValue({ status: "stale", reason: "plan_revision" });
    let releaseInvalidation: () => void = () => undefined;
    mocks.invalidations.activityPlans.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          releaseInvalidation = () => resolve(undefined);
        }),
    );
    const { rerender } = renderPreview();
    fireEvent.click(screen.getByRole("button", { name: "Apply this scenario" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm apply" }));
    fireEvent.click(screen.getByRole("button", { name: "Check or retry this change" }));
    await waitFor(() => expect(mocks.invalidations.activityPlans).toHaveBeenCalledOnce());
    expect(mocks.invalidations.ledger).toHaveBeenCalledOnce();

    mocks.actorId = "00000000-0000-4000-8000-000000000002";
    rerender(
      <SessionScenarioPreview activityPlan={activityPlan} session={session} timeZone="UTC" />,
    );
    releaseInvalidation();
    await Promise.resolve();
    expect(screen.queryByText(/preview is no longer current/i)).toBeNull();
    expect(mocks.previewResult.refetch).not.toHaveBeenCalled();
  });

  it("refreshes a stale plan through the current revision without auto-applying a replacement operation", async () => {
    mocks.previewResult.data = availablePreview();
    mocks.apply.mockResolvedValue({ status: "stale", reason: "plan_revision" });
    const firstOperationId = "00000000000040008000000000000001";
    const secondOperationId = "00000000000040008000000000000002";
    vi.stubGlobal("crypto", {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce(firstOperationId)
        .mockReturnValueOnce(secondOperationId),
    });
    let releaseActivityPlans: () => void = () => undefined;
    mocks.invalidations.activityPlans.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          releaseActivityPlans = () => resolve(undefined);
        }),
    );
    const { rerender } = renderPreview();
    fireEvent.click(screen.getByRole("button", { name: "Apply this scenario" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm apply" }));
    fireEvent.click(screen.getByRole("button", { name: "Check or retry this change" }));
    await waitFor(() => expect(mocks.invalidations.activityPlans).toHaveBeenCalledOnce());

    mocks.previewResult = {
      data: {
        ...availablePreview(),
        provenance: {
          ...availablePreview().provenance,
          selectedPlan: { id: "current-plan", revision: 2 },
        },
      },
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    };
    rerender(
      <SessionScenarioPreview
        activityPlan={{ detail: { activityPlanRevision: 2 } }}
        session={session}
        timeZone="UTC"
      />,
    );
    expect(mocks.previewInput).toMatchObject({ expectedPlanRevision: 2 });
    expect(screen.getByRole("button", { name: "Apply this scenario" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Check or retry this change" })).toBeNull();
    expect(mocks.apply).toHaveBeenCalledOnce();

    releaseActivityPlans();
    await waitFor(() => expect(mocks.previewResult.refetch).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Apply this scenario" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm apply" }));
    const armed = JSON.parse(
      localStorage.getItem("gradientpeak:planned-session-scenario:v1:profile-a:session-a") ?? "{}",
    );
    expect(armed.request.operationId).toBe(secondOperationId);
    expect(armed.request.operationId).not.toBe(firstOperationId);
    vi.unstubAllGlobals();
  });
});
