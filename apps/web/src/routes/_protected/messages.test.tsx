// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "./messages";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  createConversation: vi.fn(),
  getOrCreateDM: vi.fn(),
  sendMessage: vi.fn(),
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

vi.mock("@repo/api/react", () => ({
  invalidateConversationQueries: vi.fn(async () => undefined),
  invalidateMessagingInboxQueries: vi.fn(async () => undefined),
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
      getOrCreateDM: {
        useMutation: () => ({ isPending: false, mutateAsync: mocks.getOrCreateDM }),
      },
      createConversation: {
        useMutation: () => ({ isPending: false, mutateAsync: mocks.createConversation }),
      },
      sendMessage: { useMutation: () => ({ isPending: false, mutateAsync: mocks.sendMessage }) },
    },
    social: {
      searchUsers: {
        useQuery: () => ({
          data: {
            users: [{ id: "user-2", username: "second", is_public: true, avatar_url: null }],
          },
          isLoading: false,
        }),
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.routeSearch.composeGroup = "Paceline";
  mocks.routeSearch.composeQuery = "coach";
  mocks.routeSearch.composeRecipients = [
    { id: "user-1", username: "rider", is_public: true, avatar_url: null },
  ];
});

describe("messages recipient GET form", () => {
  it("submits native search params once and keeps clear local until submit", () => {
    const MessagesPage = (Route as unknown as { component: React.ComponentType }).component;
    const { rerender } = render(<MessagesPage />);

    const input = screen.getByRole("searchbox", { name: "Search message recipients" });
    const form = input.closest("form");
    if (!form) throw new Error("Expected message recipient GET form");
    expect(input.getAttribute("name")).toBe("composeQuery");

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

  it("creates or reopens a direct conversation for one selected recipient", async () => {
    mocks.getOrCreateDM.mockResolvedValue({ id: "conversation-dm" });
    const MessagesPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<MessagesPage />);

    fireEvent.click(screen.getByRole("button", { name: "Start conversation" }));

    await waitFor(() =>
      expect(mocks.getOrCreateDM).toHaveBeenCalledWith({ target_user_id: "user-1" }),
    );
    expect(mocks.createConversation).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "/messages",
          search: expect.objectContaining({ conversationId: "conversation-dm" }),
        }),
      ),
    );
  });

  it("creates a named group for multiple selected recipients", async () => {
    mocks.createConversation.mockResolvedValue({ id: "conversation-group" });
    const MessagesPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<MessagesPage />);

    fireEvent.click(screen.getByRole("button", { name: /@second/i }));
    fireEvent.click(screen.getByRole("button", { name: "Create conversation" }));

    await waitFor(() =>
      expect(mocks.createConversation).toHaveBeenCalledWith({
        participant_ids: ["user-1", "user-2"],
        group_name: "Paceline",
      }),
    );
    expect(mocks.getOrCreateDM).not.toHaveBeenCalled();
  });
});
