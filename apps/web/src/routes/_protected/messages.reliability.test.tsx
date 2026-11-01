// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType, InputHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useSearch = vi.hoisted(() => vi.fn());
const useNavigate = vi.hoisted(() => vi.fn());
const conversationsQuery = vi.hoisted(() => vi.fn());
const messagesQuery = vi.hoisted(() => vi.fn());
const searchUsersQuery = vi.hoisted(() => vi.fn());
const markAsRead = vi.hoisted(() => vi.fn());
const refetchConversations = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => ({
    ...options,
    useNavigate,
    useSearch,
  }),
  Link: ({ children, search, ...props }: { children: ReactNode; search: unknown }) => (
    <a data-search={JSON.stringify(search)} href="/messages" {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@repo/core/messaging", () => ({
  getConversationDisplayName: (conversation: { id: string }) => conversation.id,
  getConversationInitials: () => "GP",
  getConversationPreviewText: () => "Preview",
}));
vi.mock("@repo/api/react", () => ({
  invalidateConversationQueries: vi.fn(),
  invalidateMessagingInboxQueries: vi.fn(),
}));
vi.mock("../../components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "me" } }),
}));
vi.mock("../../components/route-flash-toast", () => ({ RouteFlashToast: () => null }));
vi.mock("../../lib/messaging/server-actions", () => ({ sendMessageAction: { url: "/messages" } }));
vi.mock("@repo/ui/components/avatar", () => ({
  Avatar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  AvatarImage: () => null,
}));
vi.mock("@repo/ui/components/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@repo/ui/components/button", () => ({
  Button: ({ children, asChild, ...props }: { children: ReactNode; asChild?: boolean }) =>
    asChild ? children : <button {...props}>{children}</button>,
}));
vi.mock("@repo/ui/components/input", () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
vi.mock("@repo/ui/components/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@repo/ui/components/separator", () => ({ Separator: () => <hr /> }));
vi.mock("@repo/ui/lib/cn", () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(" "),
}));

vi.mock("../../lib/api/client", () => ({
  api: {
    useUtils: () => ({}),
    messaging: {
      getConversations: { useQuery: conversationsQuery },
      getMessages: { useQuery: messagesQuery },
      markAsRead: { useMutation: () => ({ mutate: markAsRead }) },
      getOrCreateDM: { useMutation: () => ({ isPending: false }) },
      createConversation: { useMutation: () => ({ isPending: false }) },
    },
    social: { searchUsers: { useQuery: searchUsersQuery } },
  },
}));

import { MessagesPage } from "./messages";

const conversationA = {
  id: "conversation-a",
  unread_count: 1,
  peer_profile: null,
  is_group: false,
};
const conversationB = {
  id: "conversation-b",
  unread_count: 0,
  peer_profile: null,
  is_group: false,
};

function queryState(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isError: false,
    isFetching: false,
    isLoading: false,
    isSuccess: false,
    refetch: refetchConversations,
    ...overrides,
  };
}

function search(overrides: Record<string, unknown> = {}) {
  return {
    compose: false,
    composeGroup: undefined,
    composeQuery: undefined,
    composeRecipients: [],
    conversationId: undefined,
    flash: undefined,
    flashType: undefined,
    ...overrides,
  };
}

describe("messages reliability states", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    conversationsQuery.mockReturnValue(
      queryState({ data: [conversationA, conversationB], isSuccess: true }),
    );
    messagesQuery.mockReturnValue(queryState({ data: [], isSuccess: true }));
    searchUsersQuery.mockReturnValue({ data: { users: [] }, isLoading: false });
    useSearch.mockReturnValue(search());
  });

  it("does not select, read, or load a conversation until its URL id is explicit, even when polling reorders the inbox", () => {
    const view = render(<MessagesPage />);
    expect(screen.getByText("Select a conversation or start a new one.")).toBeTruthy();
    expect(messagesQuery).toHaveBeenLastCalledWith(
      { conversation_id: "" },
      expect.objectContaining({ enabled: false }),
    );

    conversationsQuery.mockReturnValue(
      queryState({ data: [conversationB, conversationA], isSuccess: true }),
    );
    view.rerender(<MessagesPage />);
    expect(screen.getByText("Select a conversation or start a new one.")).toBeTruthy();
    expect(markAsRead).not.toHaveBeenCalled();
  });

  it("uses the explicit recipient across an inbox reorder and clears a draft only when that recipient changes", () => {
    useSearch.mockReturnValue(search({ conversationId: conversationA.id }));
    const view = render(<MessagesPage />);
    const draft = screen.getByPlaceholderText("Type a message...") as HTMLInputElement;
    fireEvent.change(draft, { target: { value: "for A" } });

    conversationsQuery.mockReturnValue(
      queryState({ data: [conversationB, conversationA], isSuccess: true }),
    );
    view.rerender(<MessagesPage />);
    expect((screen.getByPlaceholderText("Type a message...") as HTMLInputElement).value).toBe(
      "for A",
    );
    expect(messagesQuery).toHaveBeenLastCalledWith(
      { conversation_id: conversationA.id },
      expect.objectContaining({ enabled: true }),
    );

    useSearch.mockReturnValue(search({ conversationId: conversationB.id }));
    view.rerender(<MessagesPage />);
    expect((screen.getByPlaceholderText("Type a message...") as HTMLInputElement).value).toBe("");
  });

  it("preserves the original recipient through compose and close", () => {
    useSearch.mockReturnValue(search({ compose: true, conversationId: conversationA.id }));
    render(<MessagesPage />);
    expect(screen.getByRole("link", { name: "Close" }).getAttribute("data-search")).toContain(
      conversationA.id,
    );
    expect((screen.getByDisplayValue(conversationA.id) as HTMLInputElement).name).toBe(
      "conversationId",
    );
  });

  it("shows inbox loading and a scoped retry below xl", () => {
    conversationsQuery.mockReturnValue(queryState({ isLoading: true, isFetching: true }));
    const view = render(<MessagesPage />);
    expect(screen.getAllByText("Loading conversations…").length).toBeGreaterThan(1);

    conversationsQuery.mockReturnValue(queryState({ isError: true }));
    view.rerender(<MessagesPage />);
    const retries = screen.getAllByRole("button", { name: "Retry" });
    const retry = retries.at(-1);
    if (!retry) throw new Error("Expected a mobile inbox retry");
    fireEvent.click(retry);
    expect(refetchConversations).toHaveBeenCalled();
  });
});
