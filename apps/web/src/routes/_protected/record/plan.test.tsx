// @vitest-environment jsdom
import { activityPlanSummarySchema } from "@repo/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordPlanPage } from "./plan";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  listError: false,
  listEmpty: false,
  dayError: false,
  detailError: false,
  refetchPlans: vi.fn(),
  refetchDay: vi.fn(),
  refetchDetail: vi.fn(),
}));
const PLAN_ID = "00000000-0000-4000-8000-000000000010";
const SESSION_ID = "00000000-0000-4000-8000-000000000020";
const structure = {
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "step",
      id: "00000000-0000-4000-8000-000000000103",
      name: "Tempo",
      duration: { type: "time", seconds: 60 },
      targets: [{ type: "%ThresholdHR", intensity: 80 }],
    },
    {
      type: "step",
      id: "00000000-0000-4000-8000-000000000104",
      name: "Perceived effort",
      duration: { type: "time", seconds: 60 },
      targets: [{ type: "RPE", intensity: 7 }],
    },
  ],
} as const;
const publicPlanFields = {
  contractVersion: "activity-plan-summary-v1",
  href: `/activity-plans/${PLAN_ID}`,
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:00:00.000Z",
  owner: { id: "other-owner", username: "coach", avatarUrl: null },
  activityPlanRevision: 2,
  visibility: "public",
  isSystemTemplate: false,
  capabilities: {
    canRecord: true,
    canSchedule: true,
    canEdit: false,
    canDelete: false,
    canLike: true,
    canDuplicate: false,
  },
  metrics: [
    ["distance", "meters"],
    ["elapsed_duration", "seconds"],
    ["common_load", "score"],
    ["objective_intensity", "ratio"],
  ].map(([key, unit]) => ({
    key,
    unit,
    label: key,
    status: "unavailable",
    value: null,
    reason: "calibration_required",
    provenance: null,
  })),
};
const plans = [
  {
    id: PLAN_ID,
    name: "Tempo run",
    description: "Steady work",
    activityCategory: "run",
    ...publicPlanFields,
    structure,
    engagement: { likes: 0, viewerHasLiked: false },
  },
  {
    id: "00000000-0000-4000-8000-000000000011",
    name: "Recovery ride",
    description: "Easy spin",
    activityCategory: "bike",
    ...publicPlanFields,
    structure,
    engagement: { likes: 0, viewerHasLiked: false },
  },
].map((plan) => activityPlanSummarySchema.parse(plan));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => mocks.navigate,
    useSearch: () => ({ activity_category: "run", gps: "off" }),
  }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/record">{children}</a>,
}));
vi.mock("../../../lib/api/client", () => ({
  api: {
    calendar: {
      day: {
        useQuery: () => ({
          data: {
            projection: {
              items: [
                {
                  id: SESSION_ID,
                  kind: "planned_activity",
                  status: "scheduled",
                  calendarDate: "2026-08-19",
                  timing: { startsAt: null },
                  plannedSession: {
                    id: SESSION_ID,
                    planningDate: "2026-08-19",
                    sessionRevision: 4,
                    lifecycle: { status: "scheduled" },
                    activityPlanId: PLAN_ID,
                  },
                },
              ],
            },
          },
          isLoading: false,
          isError: mocks.dayError,
          refetch: mocks.refetchDay,
        }),
      },
    },
    activityPlans: {
      list: {
        useInfiniteQuery: (input: { search?: string }) => ({
          data: {
            pages: [
              {
                items: mocks.listEmpty
                  ? []
                  : input.search
                    ? plans.filter((plan) =>
                        plan.name.toLowerCase().includes((input.search ?? "").toLowerCase()),
                      )
                    : plans,
                nextCursor: undefined,
              },
            ],
          },
          isFetching: false,
          isLoading: false,
          isError: mocks.listError,
          refetch: mocks.refetchPlans,
          isFetchingNextPage: false,
          hasNextPage: false,
          fetchNextPage: vi.fn(),
        }),
      },
      getById: {
        useQuery: (input: { id: string }) => ({
          data:
            input.id === PLAN_ID
              ? {
                  detail: {
                    ...plans[0],
                    activityPlanRevision: 2,
                    structure,
                    structureHash: `v1:sha256:${"a".repeat(64)}`,
                    metrics: [
                      {
                        key: "elapsed_duration",
                        label: "Duration",
                        status: "available",
                        value: 60,
                        unit: "seconds",
                      },
                    ],
                  },
                }
              : undefined,
          isLoading: false,
          isError: mocks.detailError,
          refetch: mocks.refetchDetail,
        }),
      },
    },
  },
}));
vi.mock("../../../lib/recording/provider", () => ({
  useTimerOnlyRecording: () => ({ state: { reducer: { snapshot: null } } }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.listError = false;
  mocks.listEmpty = false;
  mocks.dayError = false;
  mocks.detailError = false;
});
describe("RecordPlanPage", () => {
  it("selects a readable public plan without edit permission", () => {
    render(<RecordPlanPage />);
    const card = screen.getByRole("button", { name: "Select Tempo run" });
    expect((card as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(card);
    fireEvent.click(screen.getByRole("button", { name: "Use this plan" }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/record/session",
      search: { activity_category: "run", gps: "off", activityPlanId: PLAN_ID },
    });
  });
  it("keeps the selected plan review and action adjacent to its library card", () => {
    render(<RecordPlanPage />);

    fireEvent.click(screen.getByRole("button", { name: "Select Tempo run" }));

    const selectedCard = screen.getByTestId(`activity-plan-card-${PLAN_ID}`);
    const review = screen.getByTestId("recording-plan-review");
    expect(selectedCard.compareDocumentPosition(review) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByRole("button", { name: "Use this plan" })).toBeTruthy();
  });
  it("shows a zero-result failure rather than empty and retries without losing search", () => {
    mocks.listError = true;
    mocks.listEmpty = true;
    render(<RecordPlanPage />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search all activity plans" }), {
      target: { value: "tempo" },
    });
    expect(screen.getByRole("alert").textContent).toContain("Activity plans could not be loaded");
    expect(screen.queryByText("No activity plans match your search.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry activity plans" }));
    expect(mocks.refetchPlans).toHaveBeenCalledOnce();
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("tempo");
  });
  it("uses the canonical selectable card and preserves selection while retrying detail", () => {
    const view = render(<RecordPlanPage />);
    const card = screen.getByTestId(`activity-plan-card-${PLAN_ID}`);
    fireEvent.click(card);
    expect(card.getAttribute("aria-pressed")).toBe("true");
    expect(card.getAttribute("aria-label")).toBe("Select Tempo run");
    mocks.detailError = true;
    view.rerender(<RecordPlanPage />);
    expect(
      (screen.getByRole("button", { name: "Use this plan" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Retry selected plan" }));
    expect(mocks.refetchDetail).toHaveBeenCalledOnce();
    expect(card.getAttribute("aria-pressed")).toBe("true");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it("searches all visible recordable plans", () => {
    render(<RecordPlanPage />);
    const search = screen.getByRole("searchbox", { name: "Search all activity plans" });
    fireEvent.change(search, { target: { value: "tempo" } });
    expect(screen.getAllByText("Tempo run").length).toBeGreaterThan(0);
    expect(screen.queryByText("Recovery ride")).toBeNull();
  });
  it("records a new-style calendar session through its current activity-plan reference", () => {
    render(<RecordPlanPage />);
    fireEvent.click(
      screen.getByRole("button", {
        name: /Scheduled activity plan.*Uses the current plan at start/i,
      }),
    );
    expect(screen.queryByRole("switch", { name: "Calculated targets" })).toBeNull();
    expect(screen.getByText("80% Threshold HR")).toBeTruthy();
    expect(screen.getByText("7 RPE")).toBeTruthy();
    expect(
      screen.getByText("Recording captures the current plan when this session starts."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use this plan" }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/record/session",
      search: {
        activity_category: "run",
        gps: "off",
        plannedSessionId: SESSION_ID,
        plannedSessionDate: "2026-08-19",
      },
    });
  });
});
