// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainingPlanEditor } from "./training-plan-editor";

const planId = "22222222-2222-4222-8222-222222222222";
const activityPlanId = "11111111-1111-4111-8111-111111111111";
const variantId = "33333333-3333-4333-8333-333333333333";
const mocks = vi.hoisted(() => ({
  baselineQuery: {} as Record<string, unknown>,
  create: vi.fn(),
  invalidate: vi.fn(),
  previewState: "available" as "available" | "error" | "loading" | "unavailable",
  refetchBaseline: vi.fn(),
}));

vi.mock("../../lib/api/client", () => ({
  api: {
    useUtils: () => ({
      trainingPlans: {
        invalidate: mocks.invalidate,
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
        useQuery: () => ({ data: undefined, error: null, isLoading: false, refetch: vi.fn() }),
      },
      preview: {
        useQuery: (input: unknown) => {
          const enabled = Boolean(input && typeof input === "object");
          return {
            data:
              enabled && mocks.previewState === "available"
                ? {
                    status: "available",
                    basePublishedRevision: mocks.baselineQuery.data
                      ? (mocks.baselineQuery.data as { publishedRevision: number })
                          .publishedRevision
                      : 4,
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
      getById: {
        useQuery: () => ({
          data: {
            detail: {
              defaultVariantId: "11111111-1111-4111-8111-111111111111",
              defaultVariantName: "Base",
              variants: [
                { id: "11111111-1111-4111-8111-111111111111", name: "Base" },
                { id: "33333333-3333-4333-8333-333333333333", name: "Build" },
              ],
            },
          },
          isError: false,
          isLoading: false,
        }),
      },
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
  mocks.baselineQuery = baselineQuery(4, 40, 30);
  mocks.previewState = "available";
  mocks.create.mockResolvedValue({ status: "saved", planId });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TrainingPlanEditor", () => {
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
    expect(mocks.create.mock.calls[0]?.[0].draft.structure.sessions[0]).not.toHaveProperty(
      "activity_plan_variant_id",
    );
  });

  it("sends an optional explicit activity-plan variant for the server to pin", async () => {
    render(<TrainingPlanEditor onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Build plan" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    fireEvent.change(screen.getByLabelText("Variant"), { target: { value: variantId } });
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0]?.[0].draft.structure.sessions[0]).toMatchObject({
      activity_plan_id: activityPlanId,
      activity_plan_variant_id: variantId,
    });
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

    expect((await screen.findByRole("alert")).textContent).toContain("draft is preserved");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Retained draft");
    expect(mocks.refetchBaseline).toHaveBeenCalled();

    mocks.baselineQuery = baselineQuery(5, 55, 45);
    view.rerender(<TrainingPlanEditor onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Rebase and retry validation" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(planId));
    expect(mocks.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "create",
        basePublishedRevision: 5,
      }),
    );
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Retained draft");
  });

  it("announces loading, error, and unavailable authoritative preview states", () => {
    mocks.previewState = "loading";
    const view = render(<TrainingPlanEditor onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Base plan" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    expect(screen.getByRole("status").textContent).toContain("Validating this draft");

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
