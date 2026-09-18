// @vitest-environment jsdom

import type { AthletePerformanceTargetFacts } from "@repo/core/performance-model";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "./$activityPlanId";

const mocks = vi.hoisted(() => ({
  createEvent: vi.fn(),
  createOptions: null as null | {
    onError: (error: { message: string }) => void;
    onSettled: () => void;
  },
  scheduleError: false,
  refetchSchedule: vi.fn(),
  eventListInput: undefined as unknown,
  performanceTargets: undefined as AthletePerformanceTargetFacts | undefined,
  plan: undefined as unknown,
  planInputs: [] as unknown[],
  readModelOptions: [] as unknown[],
  activityPlanId: "invalid-plan",
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => vi.fn(),
    useParams: () => ({ activityPlanId: mocks.activityPlanId }),
    useSearch: () => ({ edit: undefined }),
  }),
}));
vi.mock("../../../components/activity-plan/activity-plan-comments", () => ({
  ActivityPlanComments: () => null,
}));
vi.mock("../../../components/activity-plan/activity-plan-structure", () => ({
  ActivityPlanStructure: () => <div>Read-only structure</div>,
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
      getById: {
        useQuery: (input: unknown) => {
          mocks.planInputs.push(input);
          return { data: mocks.plan, isLoading: false };
        },
      },
      update: { useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }) },
      duplicate: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      delete: { useMutation: () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }) },
    },
    athleteIntelligence: {
      getReadModel: {
        useQuery: (_input: unknown, options: unknown) => {
          mocks.readModelOptions.push(options);
          return {
            data:
              (options as { enabled?: boolean }).enabled === true
                ? { publishedState: { performanceTargets: mocks.performanceTargets } }
                : undefined,
          };
        },
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
                  plannedSessions: false,
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
    profiles: {
      get: { useQuery: () => ({ data: { id: "owner-1" }, isError: false, isLoading: false }) },
    },
    plannedSessions: {
      range: {
        useQuery: (input: unknown) => {
          mocks.eventListInput = input;
          return {
            data: { items: [] },
            isError: mocks.scheduleError,
            isLoading: false,
            refetch: mocks.refetchSchedule,
          };
        },
      },
      create: {
        useMutation: (options: NonNullable<typeof mocks.createOptions>) => {
          mocks.createOptions = options;
          return { isPending: false, mutate: mocks.createEvent };
        },
      },
      move: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      cancel: { useMutation: () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }) },
    },
    events: {
      create: { useMutation: () => ({ isPending: false, mutate: mocks.createEvent }) },
      delete: { useMutation: () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }) },
      update: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
    social: { toggleLike: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) } },
    useUtils: () => ({ activityPlans: { invalidate: vi.fn() }, calendar: { invalidate: vi.fn() } }),
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  mocks.createEvent.mockReset();
  mocks.scheduleError = false;
  mocks.refetchSchedule.mockReset();
  mocks.eventListInput = undefined;
  mocks.planInputs = [];
  mocks.readModelOptions = [];
  mocks.activityPlanId = "invalid-plan";
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
  });
});

describe("ActivityPlanDetailPage print", () => {
  it("automatically personalizes an eligible owner session flow and prints the selected structure", () => {
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
        capabilities: { canDuplicate: true, canEdit: true, canSchedule: true },
        engagement: { likes: 0, viewerHasLiked: false },
        metrics: [
          {
            key: "distance",
            label: "Distance",
            status: "available",
            value: 10_000,
            unit: "meters",
            reason: null,
            provenance: "authored",
          },
          {
            key: "elapsed_duration",
            label: "Duration",
            status: "available",
            value: 3_600,
            unit: "seconds",
            reason: null,
            provenance: "authored",
          },
          {
            key: "common_load",
            label: "Personalized load",
            status: "available",
            value: 72,
            unit: "score",
            reason: null,
            provenance: "estimated",
          },
          {
            key: "objective_intensity",
            label: "Intensity",
            status: "available",
            value: 0.8,
            unit: "ratio",
            reason: null,
            provenance: "estimated",
          },
        ],
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
    const view = render(<ActivityPlanDetailPage />);

    expect(mocks.planInputs).toContainEqual({ id: "invalid-plan", personalize: false });
    expect(mocks.readModelOptions).toContainEqual({ enabled: true });
    expect(screen.getByText("Session Flow")).toBeTruthy();
    expect(screen.getByRole("figure", { name: /Session flow with 1 work block/ })).toBeTruthy();
    expect(
      screen.getByTestId("activity-plan-session-flow-timeline-bar-0").getAttribute("data-kind"),
    ).toBe("work");
    expect(screen.getByText("Work")).toBeTruthy();
    expect(screen.getByText(/1m at 240 W/)).toBeTruthy();
    expect(screen.getByText(/240 W/)).toBeTruthy();
    const authoredTimelineIntensity = screen
      .getByTestId("activity-plan-session-flow-timeline-bar-0")
      .getAttribute("data-intensity");
    expect(
      screen.getByRole("switch", { name: "Calculated targets" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByText("Distance")).toBeTruthy();
    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("Intensity")).toBeTruthy();
    expect(screen.getByLabelText("Distance, 10 km, Authored")).toBeTruthy();
    expect(screen.getByLabelText("Duration, 1h, Authored")).toBeTruthy();
    expect(screen.getByLabelText("Load, ~72, Estimated")).toBeTruthy();
    expect(screen.getByLabelText("Intensity, ~0.80, Estimated")).toBeTruthy();
    expect(screen.queryByText(/~1h|approximately 1h/i)).toBeNull();
    expect(screen.queryByText(/recorded signal pattern|effort profile/i)).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Calculated targets" }));
    expect(
      screen.getByRole("switch", { name: "Calculated targets" }).getAttribute("aria-checked"),
    ).toBe("false");
    expect(screen.queryByText(/240 W/)).toBeNull();
    expect(screen.getByText(/80% FTP/)).toBeTruthy();
    expect(
      screen
        .getByTestId("activity-plan-session-flow-timeline-bar-0")
        .getAttribute("data-intensity"),
    ).toBe(authoredTimelineIntensity);
    expect(mocks.planInputs).not.toContainEqual({ id: "invalid-plan", personalize: true });

    fireEvent.click(screen.getByRole("switch", { name: "Calculated targets" }));
    expect(screen.getByText(/240 W/)).toBeTruthy();

    mocks.activityPlanId = "another-plan";
    view.rerender(<ActivityPlanDetailPage />);
    expect(
      screen.getByRole("switch", { name: "Calculated targets" }).getAttribute("aria-checked"),
    ).toBe("true");

    expect((screen.getByRole("combobox", { name: "PDF format" }) as HTMLSelectElement).value).toBe(
      "full-page",
    );
    expect(screen.getByRole("option", { name: "Bike cue strip" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open / Print" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share PDF" })).toBeTruthy();
    expect(screen.getByText("Read-only structure")).toBeTruthy();
    expect(screen.getByText("Read-only structure").parentElement?.className).toContain(
      "print:hidden",
    );
    expect(screen.getByTestId("activity-plan-session-flow").className).not.toContain(
      "print:hidden",
    );
  });

  it("schedules a selected system catalog activity plan without an owned plan", () => {
    mocks.plan = {
      detail: {
        id: "invalid-plan",
        name: "Tempo bike",
        description: "Steady work",
        notes: null,
        activityCategory: "bike",
        visibility: "public",
        createdAt: "2026-07-01T00:00:00.000Z",
        gpsRecordingEnabled: true,
        owner: null,
        isSystemTemplate: true,
        capabilities: { canDuplicate: true, canEdit: false, canSchedule: true },
        engagement: { likes: 0, viewerHasLiked: false },
        metrics: [
          {
            key: "distance",
            label: "Distance",
            status: "unavailable",
            value: null,
            unit: "meters",
            reason: "not_prescribed",
            provenance: null,
          },
          {
            key: "elapsed_duration",
            label: "Duration",
            status: "available",
            value: 300,
            unit: "seconds",
            reason: null,
            provenance: "authored",
          },
          {
            key: "common_load",
            label: "Load",
            status: "available",
            value: 40.5,
            unit: "score",
            reason: null,
            provenance: "estimated",
          },
          {
            key: "objective_intensity",
            label: "Intensity",
            status: "available",
            value: 0.9,
            unit: "ratio",
            reason: null,
            provenance: "estimated",
          },
        ],
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
    const view = render(<ActivityPlanDetailPage />);

    const { range } = mocks.eventListInput as { range: { startDate: string; endDate: string } };
    expect((Date.parse(range.endDate) - Date.parse(range.startDate)) / 86_400_000 + 1).toBe(366);

    fireEvent.change(screen.getByLabelText("Schedule date"), { target: { value: "2026-10-26" } });
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

    expect(mocks.createEvent).toHaveBeenCalledWith({
      profileId: "owner-1",
      session: expect.objectContaining({
        activityPlanId: "invalid-plan",
        planningDate: "2026-10-26",
      }),
    });
    const first = mocks.createEvent.mock.calls[0]?.[0];
    expect((screen.getByLabelText("Schedule date") as HTMLInputElement).disabled).toBe(true);
    act(() => {
      mocks.createOptions?.onError({ message: "Response lost" });
      mocks.createOptions?.onSettled();
    });
    fireEvent.change(screen.getByLabelText("Schedule date"), { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Retry schedule" }));
    expect(mocks.createEvent.mock.calls[1]?.[0]).toBe(first);
    expect(mocks.createEvent.mock.calls[1]?.[0].session.source.operationId).toBe(
      first.session.source.operationId,
    );
    mocks.scheduleError = true;
    view.rerender(<ActivityPlanDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Retry loading schedule" }));
    expect(mocks.refetchSchedule).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText("Schedule date") as HTMLInputElement).value).toBe("2026-10-26");
  });

  it("personalizes an eligible non-owner session flow using the viewer's performance targets", () => {
    mocks.plan = {
      detail: {
        id: "invalid-plan",
        name: "Shared bike plan",
        description: "Steady work",
        activityCategory: "bike",
        visibility: "public",
        createdAt: "2026-07-01T00:00:00.000Z",
        owner: null,
        capabilities: { canDuplicate: false, canEdit: false, canSchedule: true },
        engagement: { likes: 0, viewerHasLiked: false },
        metrics: [
          {
            key: "distance",
            label: "Distance",
            status: "unavailable",
            value: null,
            unit: "meters",
            reason: "not_prescribed",
            provenance: null,
          },
          {
            key: "elapsed_duration",
            label: "Duration",
            status: "available",
            value: 300,
            unit: "seconds",
            reason: null,
            provenance: "authored",
          },
          {
            key: "common_load",
            label: "Load",
            status: "unavailable",
            value: null,
            unit: "score",
            reason: "activity_data_missing",
            provenance: null,
          },
          {
            key: "objective_intensity",
            label: "Intensity",
            status: "unavailable",
            value: null,
            unit: "ratio",
            reason: "activity_data_missing",
            provenance: null,
          },
        ],
        structure: {
          version: 3,
          activity_category: "bike",
          segments: [
            {
              id: "00000000-0000-4000-8000-000000000011",
              role: "activity",
              name: "Ride",
              intervals: [
                {
                  id: "00000000-0000-4000-8000-000000000012",
                  name: "Threshold",
                  repetitions: 1,
                  steps: [
                    {
                      id: "00000000-0000-4000-8000-000000000013",
                      name: "Work",
                      duration: { type: "time", seconds: 300 },
                      targets: [{ type: "%FTP", intensity: 90 }],
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

    expect(screen.getByText("Session Flow")).toBeTruthy();
    expect(screen.getByTestId("activity-plan-session-flow")).toBeTruthy();
    expect(screen.getByText(/270 W/)).toBeTruthy();
    expect(screen.getByText("Read-only structure")).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: "Calculated targets" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.queryByRole("button", { name: "Duplicate" })).toBeNull();
    expect(screen.queryByText(/Duplicate .* editable copy/)).toBeNull();
    expect(screen.getByTestId("activity-plan-schedule")).toBeTruthy();
    expect(screen.getByTestId("activity-plan-estimates")).toBeTruthy();
    expect(screen.getByLabelText("Distance, Unavailable, Unavailable")).toBeTruthy();
    expect(screen.getByLabelText("Duration, 5m, Authored")).toBeTruthy();
    expect(screen.getAllByLabelText("Load, Unavailable, Unavailable")).toHaveLength(1);
    expect(screen.getAllByLabelText("Intensity, Unavailable, Unavailable")).toHaveLength(1);
    expect(screen.queryByText("Plan intent")).toBeNull();
    expect(screen.queryByText("Personalized")).toBeNull();
    expect(mocks.readModelOptions).toContainEqual({ enabled: true });
  });
});
