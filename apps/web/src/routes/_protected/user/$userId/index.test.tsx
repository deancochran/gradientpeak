// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: {} as {
    data?: Record<string, unknown>;
    error?: unknown;
    isLoading?: boolean;
    refetch?: () => void;
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: React.PropsWithChildren) => <a href="/">{children}</a>,
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => vi.fn(),
    useParams: () => ({ userId: "11111111-1111-4111-8111-111111111111" }),
    useSearch: () => ({}),
  }),
}));
vi.mock("../../../../components/protected/follow-action-form", () => ({
  FollowActionForm: () => null,
}));
vi.mock("../../../../components/protected/message-action-form", () => ({
  MessageActionForm: () => null,
}));
vi.mock("../../../../components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null }),
}));
vi.mock("../../../../components/route-flash-toast", () => ({ RouteFlashToast: () => null }));
vi.mock("../../../../lib/api/client", () => ({
  api: {
    groups: { forProfile: { useQuery: () => ({}) } },
    profiles: { getPublicById: { useQuery: () => mocks.query } },
  },
}));

import { Route } from "./index";

afterEach(() => {
  cleanup();
  mocks.query = {};
});

describe("User profile route terminal states", () => {
  it("does not render cached profile data after a NOT_FOUND response", () => {
    mocks.query = {
      data: { full_name: "Stale Profile", username: "stale", is_public: true },
      error: { data: { code: "NOT_FOUND" } },
      isLoading: false,
      refetch: vi.fn(),
    };
    const Page = (Route as unknown as { component: React.ComponentType }).component;
    render(<Page />);

    expect(screen.getByRole("heading", { name: "User not found" })).toBeTruthy();
    expect(screen.queryByText("Stale Profile")).toBeNull();
  });

  it("renders missing data as not found and non-NOT_FOUND failures as retryable", () => {
    const Page = (Route as unknown as { component: React.ComponentType }).component;
    mocks.query = { error: { data: { code: "NOT_FOUND" } }, isLoading: false, refetch: vi.fn() };
    const view = render(<Page />);
    expect(screen.getByRole("heading", { name: "User not found" })).toBeTruthy();

    mocks.query = {
      error: { data: { code: "INTERNAL_SERVER_ERROR" } },
      isLoading: false,
      refetch: vi.fn(),
    };
    view.rerender(<Page />);
    expect(screen.getByRole("heading", { name: "Unable to load this profile" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
