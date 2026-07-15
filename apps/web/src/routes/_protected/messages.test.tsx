// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "./messages";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  routeSearch: {
    compose: true,
    composeGroup: "Paceline",
    composeQuery: "coach" as string | undefined,
    composeRecipients: [{ id: "user-1", username: "rider", is_public: true, avatar_url: null }],
    conversationId: undefined,
    flash: undefined,
    flashType: undefined,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => mocks.navigate,
    useSearch: () => mocks.routeSearch,
  }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@repo/ui/components/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "viewer-1" } }),
}));
vi.mock("../../components/route-flash-toast", () => ({ RouteFlashToast: () => null }));
vi.mock("../../lib/messaging/server-actions", () => ({ sendMessageAction: vi.fn() }));
vi.mock("../../lib/api/client", () => ({
  api: {
    useUtils: () => ({}),
    messaging: {
      getConversations: { useQuery: () => ({ data: [] }) },
      getMessages: { useQuery: () => ({ data: [] }) },
      markAsRead: { useMutation: () => ({ mutate: vi.fn() }) },
      getOrCreateDM: { useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }) },
      createConversation: { useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }) },
    },
    social: {
      searchUsers: {
        useQuery: () => ({ data: { users: [] }, isLoading: true }),
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.routeSearch.composeQuery = "coach";
});

describe("messages recipient GET form", () => {
  it("submits native search params once and keeps clear local until submit", () => {
    const MessagesPage = (Route as unknown as { component: React.ComponentType }).component;
    const { rerender } = render(<MessagesPage />);

    const input = screen.getByRole("searchbox", { name: "Search message recipients" });
    const form = input.closest("form");
    if (!form) throw new Error("Expected message recipient GET form");
    expect(input.getAttribute("name")).toBe("composeQuery");
    expect(screen.getByRole("status", { name: "Searching people" })).toBeTruthy();

    fireEvent.click(screen.getByTestId("messages-compose-search-clear"));
    expect((input as HTMLInputElement).value).toBe("");
    expect(new FormData(form).get("compose")).toBe("true");
    expect(new FormData(form).get("composeGroup")).toBe("Paceline");
    expect(new FormData(form).get("composeQuery")).toBe("");
    expect(new FormData(form).get("composeRecipients")).toContain("user-1");

    const submitSpy = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", submitSpy);
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(true);
    fireEvent.submit(form);
    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).not.toHaveBeenCalled();

    mocks.routeSearch.composeQuery = "runner";
    rerender(<MessagesPage />);
    expect((input as HTMLInputElement).value).toBe("runner");
  });
});
