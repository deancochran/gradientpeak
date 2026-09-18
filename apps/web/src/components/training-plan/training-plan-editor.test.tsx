// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainingPlanEditor } from "./training-plan-editor";
import { buildTrainingPlanStructure } from "./training-plan-model";

vi.mock("@tanstack/react-router", () => ({ useBlocker: vi.fn() }));

const planId = "22222222-2222-4222-8222-222222222222";
const mocks = vi.hoisted(() => ({
  baselineQuery: {} as Record<string, unknown>,
  create: vi.fn(),
  invalidate: vi.fn(),
  preview: vi.fn(),
  previewState: "available" as "available" | "error" | "loading" | "unavailable",
  refetchBaseline: vi.fn(),
  plan: undefined as undefined | Record<string, unknown>,
}));

vi.mock("../../lib/api/client", () => ({
  api: {
    useUtils: () => ({
      trainingPlans: {
        invalidate: mocks.invalidate,
        preview: {
          fetch: mocks.preview,
        },
      },
    }),
    athleteIntelligence: {
      getReadModel: { useQuery: () => mocks.baselineQuery },
    },
    profiles: {
      get: {
        useQuery: () => ({
          data: { id: "44444444-4444-4444-8444-444444444444" },
          error: null,
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
    },
    trainingPlans: {
      get: {
        useQuery: () => ({ data: mocks.plan, error: null, isLoading: false, refetch: vi.fn() }),
      },
      preview: {
        useQuery: (input: unknown) => {
          const enabled = Boolean(input && typeof input === "object");
          return {
            data:
              enabled && mocks.previewState === "available"
                ? {
                    status: "available",
                    applicable: true,
                    explanations: [],
                    basePublishedRevision: mocks.baselineQuery.data
                      ? (mocks.baselineQuery.data as { publishedRevision: number })
                          .publishedRevision
                      : 4,
                    previewFingerprint: `v1:sha256:${"a".repeat(64)}`,
                    simulation: {
                      projectedState: { longTermLoad: 42, recentLoad: 36, loadBalance: 6 },
                      goalAssessment: null,
                    },
                  }
                : enabled && mocks.previewState === "unavailable"
                  ? { status: "unavailable" }
                  : undefined,
            error: enabled && mocks.previewState === "error" ? new Error("preview offline") : null,
            isFetching: enabled && mocks.previewState === "loading",
            isLoading: enabled && mocks.previewState === "loading",
            refetch: vi.fn(),
          };
        },
      },
      commit: {
        useMutation: () => ({ isPending: false, mutateAsync: mocks.create }),
      },
    },
    activityPlans: {
      list: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                name: "Aerobic ride",
                activityCategory: "bike",
                metrics: [
                  {
                    key: "common_load",
                    status: "available",
                    value: 80,
                  },
                ],
              },
            ],
          },
          error: null,
          isLoading: false,
        }),
      },
    },
  },
}));

beforeEach(() => {
  mocks.plan = undefined;
  mocks.baselineQuery = baselineQuery(4, 40, 30);
  mocks.previewState = "available";
  mocks.preview.mockResolvedValue({
    status: "available" as const,
    applicable: true,
    explanations: [],
    basePublishedRevision: 4,
    previewFingerprint: `v1:sha256:${"a".repeat(64)}`,
    simulation: {
      projectedState: { longTermLoad: 42, recentLoad: 36, loadBalance: 6 },
      goalAssessment: null,
    },
  });
  mocks.create.mockResolvedValue({ status: "saved", planId });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TrainingPlanEditor", () => {
  it.each([
    "private",
    "followers",
    "public",
  ])("round-trips %s visibility through create and the same edit owner", async (visibility) => {
    const view = render(<TrainingPlanEditor onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Visibility plan" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    fireEvent.change(screen.getByLabelText("Visibility"), { target: { value: visibility } });
    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    const saved = mocks.create.mock.calls[0]?.[0].draft;
    expect(saved.contentVisibility).toBe(visibility);
    view.unmount();
    mocks.plan = {
      ...saved,
      id: planId,
      content_visibility: saved.contentVisibility,
      editor: { revision: 1, structureHash: `v1:sha256:${"a".repeat(64)}` },
    };
    render(<TrainingPlanEditor planId={planId} onSaved={vi.fn()} />);
    expect((screen.getByLabelText("Visibility") as HTMLSelectElement).value).toBe(visibility);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1]?.[0]).toMatchObject({
      kind: "update",
      draft: { planId, contentVisibility: visibility },
    });
  });

  it("guards Cancel and discards only confirmed unsaved create changes", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<TrainingPlanEditor onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Keep changes" } });
    fireEvent.change(screen.getByLabelText("Visibility"), { target: { value: "public" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel changes" }));
    expect(confirm).toHaveBeenCalledWith("Discard unsaved changes?");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Keep changes");
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel changes" }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Visibility") as HTMLSelectElement).value).toBe("private");
    expect(mocks.create).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
  it("restores hydrated edit values only after confirmed Cancel", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mocks.plan = {
      id: planId,
      name: "Saved plan",
      description: "Saved notes",
      content_visibility: "followers",
      structure: buildTrainingPlanStructure([
        {
          draftId: "11111111-1111-4111-8111-111111111111",
          activityPlanId: null,
          activityCategory: "bike",
          offsetDays: 0,
          title: "Ride",
        },
      ]),
      editor: { revision: 1, structureHash: `v1:sha256:${"a".repeat(64)}` },
    };
    render(<TrainingPlanEditor planId={planId} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Visibility"), { target: { value: "public" } });
    fireEvent.change(screen.getByLabelText("Day offset"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel changes" }));
    expect((screen.getByLabelText("Visibility") as HTMLSelectElement).value).toBe("public");
    expect(screen.getByRole("alert")).toBeTruthy();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel changes" }));
    expect((screen.getByLabelText("Visibility") as HTMLSelectElement).value).toBe("followers");
    expect((screen.getByLabelText("Day offset") as HTMLInputElement).value).toBe("0");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("requests the authoritative draft projection and saves only persisted identity", async () => {
    const onSaved = vi.fn();
    render(<TrainingPlanEditor onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Base plan" } });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-08-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));

    expect(screen.getByRole("status").textContent).toContain("Fitness");
    expect(screen.getByRole("status").textContent).toContain("Fatigue");
    expect(screen.getByRole("status").textContent).toContain("Form");
    expect(screen.getByRole("status").textContent).toContain("Readiness—");

    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(planId));
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "create",
        basePublishedRevision: 4,
      }),
    );
    expect(mocks.create.mock.calls[0]?.[0]).not.toHaveProperty("plannedSessions");
  });

  it("keeps the selected category when automatic selection is chosen and allows changing it", async () => {
    render(<TrainingPlanEditor onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Automatic plan" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    fireEvent.change(screen.getByLabelText("Activity plan"), { target: { value: "" } });

    const category = screen.getByLabelText("Activity category") as HTMLSelectElement;
    expect(category.value).toBe("bike");
    fireEvent.change(category, { target: { value: "run" } });
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls.at(-1)?.[0]).toMatchObject({
      draft: {
        structure: {
          sessions: [{ activity_plan_id: null, demand: { activity_category: "run" } }],
        },
      },
    });
  });

  it("does not turn a blank day offset into zero or submit the prior valid draft", () => {
    render(<TrainingPlanEditor onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Offset plan" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    fireEvent.change(screen.getByLabelText("Day offset"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));

    expect(screen.getByRole("alert").textContent).toContain("day offset of zero or greater");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("retries a lost save response with the same payload and no new preview", async () => {
    mocks.create
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce({ status: "saved", planId });
    const onSaved = vi.fn();
    render(<TrainingPlanEditor onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Retry plan" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));

    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    await screen.findByText(/outcome is unknown/i);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Retry plan");
    expect((screen.getByLabelText("Name") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Visibility") as HTMLSelectElement).disabled).toBe(true);
    const firstPayload = mocks.create.mock.calls[0]?.[0];
    expect(mocks.preview).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(planId));
    expect(mocks.create.mock.calls[1]?.[0]).toBe(firstPayload);
    expect(mocks.preview).toHaveBeenCalledTimes(1);
  });

  it("preserves the draft, refreshes, re-simulates, and visibly retries a stale conflict", async () => {
    mocks.create
      .mockResolvedValueOnce({ status: "stale", reason: "plan_revision" })
      .mockResolvedValueOnce({ status: "saved", planId });
    const onSaved = vi.fn();
    const view = render(<TrainingPlanEditor onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Retained draft" } });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-08-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));

    expect((await screen.findByRole("alert")).textContent).toContain("changes are preserved");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Retained draft");
    expect(mocks.refetchBaseline).toHaveBeenCalled();

    mocks.baselineQuery = baselineQuery(5, 55, 45);
    view.rerender(<TrainingPlanEditor onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Rebase and retry validation" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(planId));
    expect(mocks.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "create", basePublishedRevision: 4 }),
    );
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Retained draft");
  });

  it("announces loading, error, and unavailable authoritative preview states", () => {
    mocks.previewState = "loading";
    const view = render(<TrainingPlanEditor onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Base plan" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    expect(screen.getByRole("status").textContent).toContain("Validating this plan");

    mocks.previewState = "error";
    view.rerender(<TrainingPlanEditor onSaved={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toContain("Projection could not be loaded");
    expect(screen.getByRole("button", { name: "Retry projection" })).toBeTruthy();

    mocks.previewState = "unavailable";
    view.rerender(<TrainingPlanEditor onSaved={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toContain("Projection unavailable");
  });

  it("explains stale projection state when the snapshot import failed", () => {
    const baseline = baselineQuery(4, 40, 30);
    mocks.baselineQuery = {
      ...baseline,
      data: {
        ...baseline.data,
        status: { ...baseline.data.status, freshness: "stale", importStatus: "failed" },
      },
    };

    render(<TrainingPlanEditor onSaved={vi.fn()} />);

    expect(screen.getByRole("status").textContent).toContain("activity history import failed");
  });
});

function baselineQuery(revision: number | null, longTermLoad: number, recentLoad: number) {
  return {
    data: {
      contractVersion: "athlete-read-model-v1",
      profileId: "44444444-4444-4444-8444-444444444444",
      asOf: "2026-08-01T00:00:00.000Z",
      publishedRevision: revision,
      algorithmVersion: revision === null ? null : "athlete-state-projection-v1",
      status: {
        freshness: revision === null ? "unavailable" : "fresh",
        rebuildStatus: revision === null ? "unavailable" : "fresh",
        importStatus: "complete" as const,
      },
      currentBaseline: {
        planningTimezone: "UTC",
        currentPlanningDate: "2026-08-01",
        baseline:
          revision === null
            ? null
            : {
                contractVersion: "athlete-state-projection-v1",
                athleteId: "44444444-4444-4444-8444-444444444444",
                stateRevision: revision,
                asOf: "2026-08-01T00:00:00.000Z",
                longTermLoad,
                recentLoad,
                loadBalance: longTermLoad - recentLoad,
                evidenceConfidence: 0.8,
                capabilities: [],
                athleteAgeYears: 35,
              },
      },
    },
    error: null,
    isLoading: false,
    refetch: mocks.refetchBaseline,
  };
}
