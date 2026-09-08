// @vitest-environment jsdom

import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Route } from "./index";

const mocks = vi.hoisted(() => ({
  detail: undefined as unknown,
  importedSources: [] as Array<{
    id: string;
    provider: string;
    resolutionStatus: "confirmed" | "review";
  }>,
  resolveImportedSource: vi.fn(),
  keepImportedSourceSeparate: vi.fn(),
  sendCompletedActivity: vi.fn(),
  completedActivityProviders: [] as Array<{
    jobId?: string | null;
    provider: string;
    reason: string | null;
    status:
      | "ready"
      | "reconnect_required"
      | "unsupported_evidence"
      | "not_connected"
      | "unavailable"
      | "queued"
      | "running"
      | "completed"
      | "dispatch_uncertain"
      | "failed";
  }>,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => vi.fn(),
    useParams: () => ({ activityId: "activity-1" }),
  }),
  Link: ({ children }: { children: ReactNode }) => <a href="/integrations">{children}</a>,
}));

vi.mock("../../../../components/activity/session-rpe-card", () => ({
  SessionRpeCard: () => null,
}));
vi.mock("../../../../components/protected/activity-file-detail-cards", () => ({
  ActivityStreamChartsCard: () => null,
  ActivitySwimDetailCards: () => null,
}));
vi.mock("../../../../components/protected/activity-route-primitives", () => ({
  ActivityListCard: () => null,
  DetailMetricGrid: () => null,
  DetailPageIntro: ({
    actions,
    description,
    title,
  }: {
    actions: ReactNode;
    description: string;
    title: string;
  }) => (
    <>
      <h1>{title}</h1>
      <p>{description}</p>
      {actions}
    </>
  ),
  EntityMapCard: () => null,
  LikeToggleButton: () => null,
}));
vi.mock("../../../../components/protected/activity-stream-analysis-card", () => ({
  ActivityStreamAnalysisCard: () => null,
}));
vi.mock("../../../../components/protected/entity-comments-card", () => ({
  EntityCommentsCard: () => null,
}));
vi.mock("../../../../hooks/use-viewing-user-preferred-unit-system", () => ({
  useViewingUserPreferredUnitSystem: () => ({ unitSystem: "metric" }),
}));
vi.mock("../../../../lib/api/client", () => ({
  api: {
    activities: {
      getById: {
        useQuery: () => ({
          data: {
            detail: mocks.detail,
            analysis: { derived: undefined, segmentLoads: [] },
            importedSources: mocks.importedSources,
          },
          isLoading: false,
        }),
      },
      getEfforts: { useQuery: () => ({ data: [], isLoading: false, isError: false }) },
      getCompletedActivityProviderEligibility: {
        useQuery: () => ({ data: mocks.completedActivityProviders }),
      },
      listPaginated: { useQuery: () => ({ data: { items: [] } }) },
      update: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      delete: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      resolveImportedSource: {
        useMutation: () => ({ isPending: false, mutate: mocks.resolveImportedSource }),
      },
      keepImportedSourceSeparate: {
        useMutation: () => ({ isPending: false, mutate: mocks.keepImportedSourceSeparate }),
      },
      sendCompletedActivityToProvider: {
        useMutation: () => ({ isPending: false, mutate: mocks.sendCompletedActivity }),
      },
    },
    activityFiles: {
      getStreams: { useQuery: () => ({ data: { records: [] }, isLoading: false, isError: false }) },
    },
    profiles: { getPublicById: { useQuery: () => ({ data: undefined }) } },
    social: { toggleLike: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) } },
    useUtils: () => ({
      activities: { getById: { invalidate: vi.fn() }, listPaginated: { invalidate: vi.fn() } },
    }),
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  mocks.importedSources = [];
  mocks.resolveImportedSource.mockReset();
  mocks.keepImportedSourceSeparate.mockReset();
  mocks.sendCompletedActivity.mockReset();
  mocks.completedActivityProviders = [];
  mocks.detail = {
    summary: {
      id: "activity-1",
      owner: { id: "owner-1", username: "runner", avatarUrl: null },
      time: { startedAt: "2026-08-01T10:00:00.000Z", finishedAt: "2026-08-01T11:00:00.000Z" },
      activityComposition: { kind: "single", categories: ["run"] },
      title: "Recorder activity",
      notes: "Indoor session",
      visibility: "private",
      engagement: { likes: 0, viewerHasLiked: false },
      capabilities: { canEdit: true, canDelete: true },
      metrics: [],
    },
    performance: {
      distanceMeters: 0,
      elapsedSeconds: 3600,
      activeSeconds: 3500,
      movingSeconds: 3500,
      timingCoverage: "complete",
      averagePower: null,
      averageHeartRate: null,
      averageSpeedMetersPerSecond: 2,
    },
    segments: [
      {
        id: "segment-1",
        ordinal: 0,
        role: "activity",
        activityCategory: "run",
        timingCoverage: "complete",
        status: "available",
        summary: {
          version: 1,
          timing: { timingCoverage: "complete", activeMs: 3_500_000 },
          normalizedPowerResult: calculateCyclingNormalizedPower({ samples: [] }),
          recordingExecution: {
            version: 1,
            source: "recording_execution_manifest",
            coverage: "complete",
            occurrenceCount: 3,
            occurrences: [
              {
                occurrenceId: "step-1",
                globalOrdinal: 0,
                completion: { status: "completed", method: "automatic" },
              },
              {
                occurrenceId: "step-2",
                globalOrdinal: 1,
                completion: { status: "completed", method: "manual" },
              },
              {
                occurrenceId: "step-3",
                globalOrdinal: 2,
                completion: { status: "skipped", method: "manual" },
              },
            ],
          },
        },
      },
    ],
    currentArtifact: null,
    ingestion: { status: "ready", lastErrorMessage: null },
    routePolyline: null,
    linkedRoute: null,
  };
});

afterEach(cleanup);

describe("ActivityDetailPage plan execution summary", () => {
  it("renders saved completion and basis evidence without inferring adherence or sensors", () => {
    const ActivityDetailPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<ActivityDetailPage />);

    const card = screen.getByTestId("recording-execution-review");
    const cardText = card.textContent ?? "";
    expect(cardText).toContain("Plan execution");
    expect(cardText).toContain("Completed");
    expect(cardText).toContain("Skipped");
    expect(cardText).toContain("Automatic completions");
    expect(cardText).toContain("Manual completions");
    expect(screen.getByText("Completed").nextElementSibling?.textContent).toBe("2");
    expect(screen.getByText("Skipped").nextElementSibling?.textContent).toBe("1");
    expect(screen.getByText("Automatic completions").nextElementSibling?.textContent).toBe("1");
    expect(screen.getByText("Manual completions").nextElementSibling?.textContent).toBe("1");
    expect(cardText).toContain("All 3 recorded plan steps have a saved completion status.");
    expect(cardText).toContain("not target adherence or sensor performance");
    expect(cardText).not.toMatch(/target adherence (met|achieved|confirmed)/i);
    expect(cardText).not.toMatch(/sensor performance (met|achieved|confirmed)/i);
  });
});

describe("ActivityDetailPage imported sources", () => {
  it("shows compact owner controls for a source awaiting review", () => {
    mocks.importedSources = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        provider: "strava",
        resolutionStatus: "review",
      },
    ];
    const ActivityDetailPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<ActivityDetailPage />);

    expect(screen.getByTestId("imported-sources").textContent).toContain("Imported sources");
    fireEvent.click(screen.getByText("Same activity"));
    expect(mocks.resolveImportedSource).toHaveBeenCalledWith({
      action: "confirm_same",
      sourceReferenceId: "11111111-1111-4111-8111-111111111111",
    });
    fireEvent.click(screen.getByText("Keep separate"));
    expect(mocks.keepImportedSourceSeparate).toHaveBeenCalledWith({
      sourceReferenceId: "11111111-1111-4111-8111-111111111111",
    });
    expect(screen.getByText("Ignore")).toBeTruthy();
  });
});

describe("ActivityDetailPage completed activity provider action", () => {
  it("shows the owner upload action only when Strava capability and scope are ready", () => {
    mocks.completedActivityProviders = [{ provider: "strava", reason: null, status: "ready" }];
    const ActivityDetailPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<ActivityDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Send to Strava" }));
    expect(mocks.sendCompletedActivity).toHaveBeenCalledWith({
      activityId: "activity-1",
      provider: "strava",
    });
  });

  it("replaces the upload action with explicit reconnect guidance when activity:write is absent", () => {
    mocks.completedActivityProviders = [
      {
        provider: "strava",
        reason: "Reconnect Strava to grant activity upload access.",
        status: "reconnect_required",
      },
    ];
    const ActivityDetailPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<ActivityDetailPage />);
    expect(screen.queryByRole("button", { name: "Send to Strava" })).toBeNull();
    expect(screen.getByText("Reconnect Strava")).toBeTruthy();
  });

  it("surfaces a queued upload without offering another dispatch", () => {
    mocks.completedActivityProviders = [
      { jobId: "job", provider: "strava", reason: "Strava upload is queued.", status: "queued" },
    ];
    const ActivityDetailPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<ActivityDetailPage />);
    expect(screen.queryByRole("button", { name: "Send to Strava" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Strava upload queued" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
