// @vitest-environment jsdom

import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Route } from "./index";

const mocks = vi.hoisted(() => ({
  detail: undefined as unknown,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => vi.fn(),
    useParams: () => ({ activityId: "activity-1" }),
  }),
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
          data: { detail: mocks.detail, analysis: { derived: undefined, segmentLoads: [] } },
          isLoading: false,
        }),
      },
      getEfforts: { useQuery: () => ({ data: [], isLoading: false, isError: false }) },
      update: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      delete: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
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
