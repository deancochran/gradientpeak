// @vitest-environment jsdom

import type { AthletePerformanceTargetFacts } from "@repo/core/performance-model";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "./$activityPlanId";

const mocks = vi.hoisted(() => ({
  createEvent: vi.fn(),
  eventListInput: undefined as unknown,
  performanceTargets: undefined as AthletePerformanceTargetFacts | undefined,
  plan: undefined as unknown,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => vi.fn(),
    useParams: () => ({ activityPlanId: "invalid-plan" }),
  }),
}));
vi.mock("../../../components/activity-plan/activity-plan-comments", () => ({
  ActivityPlanComments: () => null,
}));
vi.mock("../../../components/activity-plan/activity-plan-structure", () => ({
  ActivityPlanStructure: ({
    performanceTargets,
  }: {
    performanceTargets?: AthletePerformanceTargetFacts;
  }) => (
    <p>
      {performanceTargets?.thresholds.bike.value
        ? `${performanceTargets.thresholds.bike.value * 0.8} W (80% FTP)`
        : "Read-only structure"}
    </p>
  ),
}));
vi.mock("../../../components/protected/activity-route-primitives", () => ({
  DetailPageIntro: ({ actions, title }: { actions: React.ReactNode; title: string }) => (
    <>
      <h1>{title}</h1>
      {actions}
    </>
  ),
  LikeToggleButton: () => null,
  OwnerSummary: () => null,
}));
vi.mock("../../../components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "owner-1" } }),
}));
vi.mock("../../../lib/api/client", () => ({
  api: {
    activityPlans: {
      getById: { useQuery: () => ({ data: mocks.plan, isLoading: false }) },
      update: { useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }) },
      duplicate: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      delete: { useMutation: () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }) },
    },
    athleteIntelligence: {
      getReadModel: {
        useQuery: () => ({
          data: { publishedState: { performanceTargets: mocks.performanceTargets } },
        }),
      },
    },
    calendar: {
      range: {
        useQuery: (input: unknown) => {
          mocks.eventListInput = input;
          return {
            data: {
              items: [],
              projection: {
                contractVersion: "calendar-projection-v1",
                startDate: "2026-07-01",
                endDateExclusive: "2027-07-02",
                timezone: "UTC",
                items: [],
                truncated: false,
                truncation: {
                  events: false,
                  completedActivities: false,
                  groupEvents: false,
                  goals: false,
                },
              },
            },
            isLoading: false,
            isError: false,
          };
        },
      },
    },
    events: {
      create: { useMutation: () => ({ isPending: false, mutate: mocks.createEvent }) },
      delete: { useMutation: () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }) },
      update: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
    social: { toggleLike: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) } },
    useUtils: () => ({ activityPlans: { invalidate: vi.fn() }, events: { invalidate: vi.fn() } }),
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  mocks.createEvent.mockReset();
  mocks.eventListInput = undefined;
  mocks.performanceTargets = buildPerformanceTargetFactsFixture({
    asOf: "2026-07-01T00:00:00.000Z",
    bikeThresholdWatts: 300,
  });
  mocks.plan = {
    content_visibility: "private",
    created_at: "2026-07-01T00:00:00.000Z",
    description: "Malformed activity",
    gps_recording_enabled: true,
    has_liked: false,
    id: "invalid-plan",
    likes_count: 0,
    name: "Invalid activity",
    notes: null,
    owner: null,
    profile_id: "owner-1",
    activity_category: "run",
    structure: { version: 3, segments: [] },
    structure_hash: "hash-1",
  };
});
afterEach(cleanup);

describe("ActivityPlanDetailPage invalid plan", () => {
  it("treats a noncanonical structure as an unavailable API result", () => {
    const ActivityPlanDetailPage = (Route as unknown as { component: React.ComponentType })
      .component;
    render(<ActivityPlanDetailPage />);

    expect(screen.getByText("Activity plan unavailable")).toBeTruthy();
    expect(screen.queryByText("Read-only structure")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(mocks.eventListInput).toMatchObject({
      activityPlanId: "invalid-plan",
      includeAdhoc: true,
      limit: 100,
    });
  });
});

describe("ActivityPlanDetailPage print", () => {
  it("prints a valid protected plan and passes available personalized targets to its structure", () => {
    mocks.plan = {
      detail: {
        id: "invalid-plan",
        name: "Tempo bike",
        description: "Steady work",
        notes: "Keep it smooth.",
        activityCategory: "bike",
        visibility: "private",
        createdAt: "2026-07-01T00:00:00.000Z",
        gpsRecordingEnabled: true,
        owner: null,
        capabilities: { canEdit: true },
        engagement: { likes: 0, viewerHasLiked: false },
        metrics: [],
        structure: {
          version: 3,
          activity_category: "bike",
          segments: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              role: "activity",
              name: "Ride",
              intervals: [
                {
                  id: "00000000-0000-4000-8000-000000000002",
                  name: "Work",
                  repetitions: 1,
                  steps: [
                    {
                      id: "00000000-0000-4000-8000-000000000003",
                      name: "Tempo",
                      duration: { type: "time", seconds: 60 },
                      targets: [{ type: "%FTP", intensity: 80 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      edit: null,
    };
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    const ActivityPlanDetailPage = (Route as unknown as { component: React.ComponentType })
      .component;
    render(<ActivityPlanDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Print / Save as PDF" }));
    expect(print).toHaveBeenCalledOnce();
    expect(screen.getByText("240 W (80% FTP)")).toBeTruthy();
  });

  it("creates a linked planned event when scheduling an unscheduled plan", () => {
    mocks.plan = {
      detail: {
        id: "invalid-plan",
        name: "Tempo bike",
        description: "Steady work",
        notes: null,
        activityCategory: "bike",
        visibility: "private",
        createdAt: "2026-07-01T00:00:00.000Z",
        gpsRecordingEnabled: true,
        owner: null,
        capabilities: { canEdit: true },
        engagement: { likes: 0, viewerHasLiked: false },
        metrics: [],
        structure: {
          version: 3,
          activity_category: "bike",
          segments: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              role: "activity",
              name: "Ride",
              intervals: [
                {
                  id: "00000000-0000-4000-8000-000000000002",
                  name: "Work",
                  repetitions: 1,
                  steps: [
                    {
                      id: "00000000-0000-4000-8000-000000000003",
                      name: "Tempo",
                      duration: { type: "time", seconds: 60 },
                      targets: [{ type: "%FTP", intensity: 80 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      edit: null,
    };
    const ActivityPlanDetailPage = (Route as unknown as { component: React.ComponentType })
      .component;
    render(<ActivityPlanDetailPage />);

    fireEvent.change(screen.getByLabelText("Schedule date"), { target: { value: "2026-10-26" } });
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

    expect(mocks.createEvent).toHaveBeenCalledWith({
      activity_plan_id: "invalid-plan",
      event_type: "planned",
      scheduled_date: "2026-10-26",
      title: "Tempo bike",
    });
  });
});
