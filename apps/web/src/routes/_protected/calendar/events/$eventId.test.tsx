// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventDeleteForm, Route } from "./$eventId/index";

const mocks = vi.hoisted(() => ({
  deleteAction: vi.fn(),
  event: undefined as unknown,
  eventInputs: [] as unknown[],
  eventOptions: [] as unknown[],
  plannedSession: undefined as unknown,
  plannedSessionInputs: [] as unknown[],
  plannedSessionOptions: [] as unknown[],
  search: { month: "2026-07", view: "month" } as Record<string, unknown>,
  createManualDiaryEntry: vi.fn(),
  completionCandidates: { canAssociate: true, items: [], nextCursor: null } as Record<
    string,
    unknown
  >,
  linkPlannedSessionCompletion: vi.fn(),
  skipPlannedSession: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => vi.fn(),
    useParams: () => ({ eventId: "event-1" }),
    useSearch: () => mocks.search,
  }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/calendar">{children}</a>,
}));

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.deleteAction }));

vi.mock("../../../../components/route-flash-toast", () => ({ RouteFlashToast: () => null }));
vi.mock("../../../../lib/planning/server-actions", () => ({
  deleteCalendarEventAction: { url: "/actions/delete" },
}));
vi.mock("../../../../lib/api/client", () => ({
  api: {
    events: {
      getById: {
        useQuery: (input: unknown, options: unknown) => {
          mocks.eventInputs.push(input);
          mocks.eventOptions.push(options);
          return { data: mocks.event, isError: false, isLoading: false };
        },
      },
    },
    plannedSessions: {
      getById: {
        useQuery: (input: unknown, options: unknown) => {
          mocks.plannedSessionInputs.push(input);
          mocks.plannedSessionOptions.push(options);
          return { data: mocks.plannedSession, isError: false, isLoading: false, refetch: vi.fn() };
        },
      },
      completionCandidates: {
        useInfiniteQuery: () => ({
          data: { pages: [mocks.completionCandidates] },
          fetchNextPage: vi.fn(),
          hasNextPage: false,
          isFetchingNextPage: false,
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
      linkCompletion: { useMutation: () => ({ mutateAsync: mocks.linkPlannedSessionCompletion }) },
      skip: { useMutation: () => ({ mutateAsync: mocks.skipPlannedSession }) },
    },
    profiles: { get: { useQuery: () => ({ data: { planning_timezone: "UTC" } }) } },
    activityPlans: { getById: { useQuery: () => ({ data: null }) } },
    activities: {
      createManualDiaryEntry: {
        useMutation: () => ({ mutateAsync: mocks.createManualDiaryEntry }),
      },
    },
    useUtils: () => ({
      activities: { invalidate: vi.fn() },
      calendar: { invalidate: vi.fn() },
      plannedSessions: {
        completionCandidates: { invalidate: vi.fn() },
        getById: { invalidate: vi.fn() },
      },
    }),
    routes: { get: { useQuery: () => ({ data: null }) } },
  },
}));

afterEach(cleanup);
afterEach(() => {
  mocks.event = undefined;
  mocks.eventInputs = [];
  mocks.eventOptions = [];
  mocks.plannedSession = undefined;
  mocks.plannedSessionInputs = [];
  mocks.plannedSessionOptions = [];
  mocks.search = { month: "2026-07", view: "month" };
  mocks.completionCandidates = { canAssociate: true, items: [], nextCursor: null };
  vi.clearAllMocks();
});

describe("EventDetailPage", () => {
  it("accepts only the explicit planned-session resource type", () => {
    const route = Route as unknown as {
      validateSearch: (search: Record<string, unknown>) => Record<string, unknown>;
    };

    expect(route.validateSearch({ resourceType: "planned_session" }).resourceType).toBe(
      "planned_session",
    );
    expect(() => route.validateSearch({ resourceType: "planned" })).toThrow(
      "Unsupported calendar resource type",
    );
  });

  it("renders a custom event without planned-session or activity-plan branches", () => {
    mocks.eventInputs = [];
    mocks.event = {
      all_day: true,
      event_type: "custom",
      id: "event-1",
      scheduled_date: "2026-07-28",
      status: "scheduled",
      title: "Tempo run",
      activityPlanSummary: null,
      notes: "Bring water",
      route_id: null,
    };
    const EventDetailPage = (Route as unknown as { component: React.ComponentType }).component;

    render(<EventDetailPage />);

    expect(screen.getByText("Bring water")).toBeTruthy();
    expect(screen.queryByText("Activity plan")).toBeNull();
    expect(screen.queryByText("Generated from training plan")).toBeNull();
    expect(mocks.eventInputs).toContainEqual({ id: "event-1", personalize: false });
    expect(mocks.eventOptions).toContainEqual({ enabled: true });
    expect(mocks.plannedSessionOptions).toContainEqual({ enabled: false });
  });

  it("loads a planned session explicitly and retries the same manual completion request", async () => {
    mocks.search = { month: "2026-07", resourceType: "planned_session", view: "month" };
    mocks.plannedSession = {
      id: "00000000-0000-4000-8000-000000000001",
      profileId: "00000000-0000-4000-8000-000000000002",
      sessionRevision: 1,
      planningDate: "2000-01-01",
      lifecycle: { status: "scheduled" },
      prescription: {
        resolutionManifest: {
          activity_plan_id: "00000000-0000-4000-8000-000000000003",
          resolved_structure: { activity_category: "run" },
        },
      },
    };
    mocks.createManualDiaryEntry.mockRejectedValueOnce(new Error("Request status is unknown"));
    mocks.createManualDiaryEntry.mockResolvedValueOnce({ outcome: "unchanged" });
    const EventDetailPage = (Route as unknown as { component: React.ComponentType }).component;

    render(<EventDetailPage />);

    expect(mocks.eventInputs).toContainEqual({ id: "event-1", personalize: false });
    expect(mocks.eventOptions).toContainEqual({ enabled: false });
    expect(mocks.plannedSessionInputs).toContainEqual({ id: "event-1" });
    expect(mocks.plannedSessionOptions).toContainEqual({ enabled: true });
    fireEvent.click(screen.getByRole("button", { name: "Actual details (optional)" }));
    const duration = screen.getByLabelText("Actual duration (minutes, optional)");
    fireEvent.change(duration, { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Complete activity" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Request status is unknown");
    fireEvent.click(screen.getByRole("button", { name: "Retry saved request" }));

    await waitFor(() => expect(mocks.createManualDiaryEntry).toHaveBeenCalledTimes(2));
    const [firstInput] = mocks.createManualDiaryEntry.mock.calls[0] ?? [];
    const [retryInput] = mocks.createManualDiaryEntry.mock.calls[1] ?? [];
    expect(firstInput).toEqual(retryInput);
    expect(duration).toHaveProperty("value", "30");
    expect(firstInput).toMatchObject({
      observation: {
        activityCategory: "run",
        diaryDate: "2000-01-01",
        diaryTimezone: "UTC",
        name: "Completed activity",
      },
      plannedSession: {
        expectedRevision: 1,
        outcome: "full",
        sessionId: "00000000-0000-4000-8000-000000000001",
      },
    });
    expect(firstInput.observation.elapsedMs).toBe(1_800_000);
    expect(firstInput.observation).not.toHaveProperty("distanceMeters");
    expect(firstInput.observation).not.toHaveProperty("rpe");
  });

  it("keeps an invalid actual draft visible and does not capture a completion payload", async () => {
    mocks.search = { month: "2026-07", resourceType: "planned_session", view: "month" };
    mocks.plannedSession = {
      id: "00000000-0000-4000-8000-000000000001",
      profileId: "00000000-0000-4000-8000-000000000002",
      sessionRevision: 1,
      planningDate: "2000-01-01",
      lifecycle: { status: "scheduled" },
      prescription: {
        resolutionManifest: {
          activity_plan_id: "00000000-0000-4000-8000-000000000003",
          resolved_structure: { activity_category: "run" },
        },
      },
    };
    const EventDetailPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<EventDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Actual details (optional)" }));
    const duration = screen.getByLabelText("Actual duration (minutes, optional)");
    fireEvent.change(duration, { target: { value: "invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Complete activity" }));

    await waitFor(() =>
      expect(
        screen.getByText("Correct the actual details before completing this session."),
      ).toBeTruthy(),
    );
    expect(duration).toHaveProperty("value", "invalid");
    expect(mocks.createManualDiaryEntry).not.toHaveBeenCalled();
  });

  it("associates only an explicitly selected recorded activity", async () => {
    mocks.search = { month: "2026-07", resourceType: "planned_session", view: "month" };
    mocks.plannedSession = {
      id: "00000000-0000-4000-8000-000000000001",
      profileId: "00000000-0000-4000-8000-000000000002",
      sessionRevision: 3,
      planningDate: "2000-01-01",
      lifecycle: {
        status: "completed",
        completion: {
          state: "linked",
          activityId: "00000000-0000-4000-8000-000000000004",
        },
      },
      prescription: {
        resolutionManifest: {
          activity_plan_id: "00000000-0000-4000-8000-000000000003",
          resolved_structure: { activity_category: "run" },
        },
      },
    };
    mocks.completionCandidates = {
      canAssociate: true,
      items: [
        {
          id: "00000000-0000-4000-8000-000000000005",
          name: "Imported run",
          activityCategory: "run",
          startedAt: "2026-08-10T08:00:00.000Z",
          elapsedMs: 1800000,
        },
      ],
      nextCursor: null,
    };
    const EventDetailPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<EventDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Associate recorded activity" }));
    expect(mocks.linkPlannedSessionCompletion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm association" }));
    await waitFor(() => expect(mocks.linkPlannedSessionCompletion).toHaveBeenCalledTimes(1));
    expect(mocks.linkPlannedSessionCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        activityId: "00000000-0000-4000-8000-000000000005",
        expectedRevision: 3,
        profileId: "00000000-0000-4000-8000-000000000002",
        sessionId: "00000000-0000-4000-8000-000000000001",
      }),
    );
  });

  it("keeps a rejected delete dialog form open with its selected scope available for retry", async () => {
    mocks.deleteAction.mockRejectedValueOnce(new Error("Delete request failed"));
    render(
      <EventDeleteForm
        eventId="00000000-0000-4000-8000-000000000001"
        recurring
        redirectTo="/calendar"
      />,
    );

    const scope = screen.getByLabelText("Delete recurrence scope") as HTMLSelectElement;
    fireEvent.change(scope, { target: { value: "future" } });
    const form = screen.getByRole("button", { name: "Delete event" }).closest("form");
    if (!(form instanceof HTMLFormElement)) throw new Error("Expected the delete form.");
    fireEvent.submit(form);

    expect((await screen.findByRole("alert")).textContent).toContain("Delete request failed");
    expect(scope.value).toBe("future");
    expect(screen.getByRole("button", { name: "Delete event" })).toBeTruthy();
  });
});
