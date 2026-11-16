// @vitest-environment jsdom
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
  plan: undefined as unknown,
  planInputs: [] as unknown[],
  recordPlanSearch: undefined as unknown,
  activityPlanId: "invalid-plan",
  navigate: vi.fn(),
  search: { edit: undefined } as Record<string, unknown>,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    search,
    to,
  }: {
    children: React.ReactNode;
    search?: Record<string, string>;
    to: string;
  }) => {
    if (to === "/record/plan") mocks.recordPlanSearch = search;
    return (
      <a href={`${to}${search?.activityPlanId ? `?activityPlanId=${search.activityPlanId}` : ""}`}>
        {children}
      </a>
    );
  },
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => mocks.navigate,
    useParams: () => ({ activityPlanId: mocks.activityPlanId }),
    useSearch: () => mocks.search,
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
  mocks.recordPlanSearch = undefined;
  mocks.activityPlanId = "invalid-plan";
  mocks.navigate.mockReset();
  mocks.search = { edit: undefined };
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
    const ActivityPlanDetailPage = (
      Route as unknown as {
        component: React.ComponentType;
      }
    ).component;
    render(<ActivityPlanDetailPage />);
    expect(screen.getByText("Activity plan unavailable")).toBeTruthy();
    expect(screen.queryByText("Read-only structure")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
});
describe("ActivityPlanDetailPage print", () => {
  it("renders the fixed authored relative prescription and print actions for an owner", () => {
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
            value: 10000,
            unit: "meters",
            reason: null,
            provenance: "authored",
          },
          {
            key: "elapsed_duration",
            label: "Duration",
            status: "available",
            value: 3600,
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
          version: 5,
          activity_category: "bike",
          items: [
            {
              type: "step",
              id: "00000000-0000-4000-8000-000000000002",
              name: "Work",
              instructions: "Keep it smooth.",
              duration: { type: "time", seconds: 60 },
              targets: [{ type: "%FTP", intensity: 80 }],
            },
          ],
        },
      },
      edit: null,
    };
    const ActivityPlanDetailPage = (
      Route as unknown as {
        component: React.ComponentType;
      }
    ).component;
    render(<ActivityPlanDetailPage />);
    expect(mocks.planInputs).toContainEqual({ id: "invalid-plan", personalize: false });
    expect(screen.getByText("Session Flow")).toBeTruthy();
    expect(screen.getByRole("figure", { name: /Session flow with 1 work step/ })).toBeTruthy();
    expect(
      screen.getByTestId("activity-plan-session-flow-timeline-bar-0").getAttribute("data-kind"),
    ).toBe("work");
    expect(screen.getAllByText("Step 1").length).toBeGreaterThan(0);
    expect(screen.getByText(/60 sec · 80% FTP/)).toBeTruthy();
    expect(
      screen
        .getByTestId("activity-plan-session-flow-timeline-bar-0")
        .getAttribute("data-intensity"),
    ).toBe("%FTP 80");
    expect(screen.queryByRole("switch", { name: "Calculated targets" })).toBeNull();
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
    expect(mocks.planInputs).not.toContainEqual({ id: "invalid-plan", personalize: true });
    expect((screen.getByRole("combobox", { name: "PDF format" }) as HTMLSelectElement).value).toBe(
      "full-page",
    );
    expect(screen.getByRole("option", { name: "Bike cue strip" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open / Print" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share PDF" })).toBeTruthy();
    expect(screen.getAllByText("Session Flow")).toHaveLength(1);
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
                      type: "step",
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
    const ActivityPlanDetailPage = (
      Route as unknown as {
        component: React.ComponentType;
      }
    ).component;
    const view = render(<ActivityPlanDetailPage />);
    const { range } = mocks.eventListInput as {
      range: {
        startDate: string;
        endDate: string;
      };
    };
    expect((Date.parse(range.endDate) - Date.parse(range.startDate)) / 86400000 + 1).toBe(366);
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
  it("renders a fixed authored relative prescription for a non-owner", () => {
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
          version: 5,
          activity_category: "bike",
          items: [
            {
              type: "step",
              id: "00000000-0000-4000-8000-000000000012",
              name: "Threshold",
              duration: { type: "time", seconds: 300 },
              targets: [{ type: "%FTP", intensity: 90 }],
            },
          ],
        },
      },
      edit: null,
    };
    const ActivityPlanDetailPage = (
      Route as unknown as {
        component: React.ComponentType;
      }
    ).component;
    render(<ActivityPlanDetailPage />);
    expect(screen.getByText("Session Flow")).toBeTruthy();
    expect(screen.getByTestId("activity-plan-session-flow")).toBeTruthy();
    expect(screen.getByText(/300 sec · 90% FTP/)).toBeTruthy();
    expect(screen.queryByText("Read-only structure")).toBeNull();
    expect(screen.queryByRole("switch", { name: "Calculated targets" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Duplicate" })).toBeNull();
    expect(screen.queryByText(/Duplicate .* editable copy/)).toBeNull();
    expect(screen.getByTestId("activity-plan-schedule")).toBeTruthy();
    expect(screen.getByTestId("activity-plan-estimates")).toBeTruthy();
    expect(screen.getByLabelText("Duration, 5m, Authored")).toBeTruthy();
    expect(screen.queryByLabelText("Distance, Unavailable, Unavailable")).toBeNull();
    expect(screen.getByText("Estimate details")).toBeTruthy();
    expect(screen.queryByText("Plan intent")).toBeNull();
    expect(screen.queryByText("Personalized")).toBeNull();
    expect(mocks.planInputs).not.toContainEqual({ id: "invalid-plan", personalize: true });
  });
  it("offers recording only when the authoritative capability permits it", () => {
    mocks.plan = {
      detail: {
        id: "invalid-plan",
        name: "Recordable plan",
        description: null,
        activityCategory: "run",
        visibility: "private",
        createdAt: "2026-07-01T00:00:00.000Z",
        owner: null,
        capabilities: { canDuplicate: false, canEdit: false, canRecord: true, canSchedule: false },
        engagement: { likes: 0, viewerHasLiked: false },
        metrics: [],
        structure: null,
      },
      edit: null,
    };
    const ActivityPlanDetailPage = (Route as unknown as { component: React.ComponentType })
      .component;
    const view = render(<ActivityPlanDetailPage />);
    expect(screen.getByRole("link", { name: "Record this plan" }).getAttribute("href")).toBe(
      "/record/plan?activityPlanId=invalid-plan",
    );
    expect(mocks.recordPlanSearch).toEqual({
      activityPlanId: "invalid-plan",
      activity_category: "run",
      gps: "off",
    });
    mocks.plan = {
      ...(mocks.plan as object),
      detail: {
        ...(mocks.plan as { detail: object }).detail,
        capabilities: { canDuplicate: false, canEdit: false, canRecord: false, canSchedule: false },
      },
    };
    view.rerender(<ActivityPlanDetailPage />);
    expect(screen.queryByRole("link", { name: "Record this plan" })).toBeNull();
  });
  it("keeps athlete preparation context when editing from the library", () => {
    mocks.search = {
      athleteId: "22222222-2222-4222-8222-222222222222",
      organizationId: "11111111-1111-4111-8111-111111111111",
      planningDate: "2026-11-12",
      returnTo: "athlete-workspace",
    };
    mocks.plan = {
      detail: {
        id: "invalid-plan",
        name: "Prepared plan",
        description: null,
        activityCategory: "run",
        visibility: "private",
        createdAt: "2026-07-01T00:00:00.000Z",
        owner: null,
        capabilities: { canDuplicate: false, canEdit: true, canSchedule: false },
        engagement: { likes: 0, viewerHasLiked: false },
        metrics: [],
        structure: null,
      },
      edit: null,
    };
    const ActivityPlanDetailPage = (Route as unknown as { component: React.ComponentType })
      .component;
    render(<ActivityPlanDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      search: {
        athleteId: "22222222-2222-4222-8222-222222222222",
        edit: true,
        organizationId: "11111111-1111-4111-8111-111111111111",
        planningDate: "2026-11-12",
        returnTo: "athlete-workspace",
      },
    });
  });
});
