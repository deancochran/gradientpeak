// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "./$activityPlanId";

const mocks = vi.hoisted(() => ({
  eventListInput: undefined as unknown,
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
  ActivityPlanStructure: () => <p>Read-only structure</p>,
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
      delete: { useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }) },
    },
    events: {
      create: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      delete: { useMutation: () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }) },
      list: {
        useQuery: (input: unknown) => {
          mocks.eventListInput = input;
          return { data: { items: [] }, isLoading: false, isError: false };
        },
      },
      update: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
    social: { toggleLike: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) } },
    useUtils: () => ({ activityPlans: { invalidate: vi.fn() }, events: { invalidate: vi.fn() } }),
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  mocks.eventListInput = undefined;
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
    expect(mocks.eventListInput).toEqual({
      activity_plan_id: "invalid-plan",
      include_adhoc: true,
      limit: 100,
    });
  });
});
