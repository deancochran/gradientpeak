// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "./messages";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  createConversation: vi.fn(),
  getOrCreateDM: vi.fn(),
  invalidateConversation: vi.fn(async () => undefined),
  sendMessage: vi.fn(),
  actorId: "viewer-1",
  conversations: [] as Array<Record<string, unknown>>,
  routeSearch: {
    compose: true as boolean,
    composeGroup: "Paceline",
    composeQuery: "coach" as string | undefined,
    composeRecipients: [{ id: "user-1", username: "rider", is_public: true, avatar_url: null }],
    conversationId: undefined as string | undefined,
    returnTo: undefined as string | undefined,
    flash: undefined,
    flashType: undefined,
  },
  inboxError: false,
  searchFetching: false,
  refetchInbox: vi.fn(),
  searchError: false,
  refetchSearch: vi.fn(),
}));

vi.mock("@repo/api/react", () => ({
  invalidateConversationQueries: mocks.invalidateConversation,
  invalidateMessagingInboxQueries: vi.fn(async () => undefined),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => mocks.navigate,
    useSearch: () => mocks.routeSearch,
  }),
  Link: ({ children, search, to }: { children: React.ReactNode; search?: unknown; to: string }) => (
    <a data-search={JSON.stringify(search)} href={to}>
      {children}
    </a>
  ),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@repo/ui/components/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: mocks.actorId } }),
}));
vi.mock("../../components/route-flash-toast", () => ({ RouteFlashToast: () => null }));
vi.mock("../../lib/messaging/server-actions", () => ({ sendMessageAction: vi.fn() }));
vi.mock("../../lib/api/client", () => ({
  api: {
    useUtils: () => ({}),
    messaging: {
      getConversations: {
        useQuery: () => ({
          data: mocks.conversations,
          isError: mocks.inboxError,
          refetch: mocks.refetchInbox,
        }),
      },
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
          isFetching: mocks.searchFetching,
          isError: mocks.searchError,
          refetch: mocks.refetchSearch,
        }),
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  mocks.sendMessage.mockReset();
  mocks.invalidateConversation.mockReset().mockResolvedValue(undefined);
  mocks.routeSearch.composeGroup = "Paceline";
  mocks.routeSearch.composeQuery = "coach";
  mocks.routeSearch.composeRecipients = [
    { id: "user-1", username: "rider", is_public: true, avatar_url: null },
  ];
  mocks.routeSearch.returnTo = undefined;
  mocks.routeSearch.compose = true;
  mocks.routeSearch.conversationId = undefined;
  mocks.conversations = [];
  mocks.actorId = "viewer-1";
  mocks.inboxError = false;
  mocks.searchError = false;
  mocks.searchFetching = false;
});

function openConversation(conversationId = "conversation-a") {
  mocks.routeSearch.compose = false;
  mocks.routeSearch.conversationId = conversationId;
  mocks.conversations = [
    {
      id: conversationId,
      is_group: false,
      group_name: null,
      last_message_at: null,
      last_message_content: null,
      participants: [],
      unread_count: 0,
    },
  ];
}

function renderConversation() {
  const MessagesPage = (Route as unknown as { component: React.ComponentType }).component;
  return render(<MessagesPage />);
}

function sendDraft(value: string) {
  const composer = screen.getByPlaceholderText("Type a message...");
  fireEvent.change(composer, { target: { value } });
  const form = composer.closest("form");
  if (!form) throw new Error("Expected message composer form");
  fireEvent.submit(form);
}

describe("messages recipient GET form", () => {
  it("keeps only an allowlisted athlete workspace return context", () => {
    mocks.routeSearch.returnTo =
      "/organizations/11111111-1111-1111-1111-111111111111/athletes/22222222-2222-2222-2222-222222222222";
    const MessagesPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<MessagesPage />);

    expect(
      screen.getByRole("link", { name: "Return to athlete workspace" }).getAttribute("href"),
    ).toBe(mocks.routeSearch.returnTo);

    const route = Route as unknown as {
      validateSearch: (search: Record<string, unknown>) => { returnTo?: string };
    };
    expect(
      route.validateSearch({ returnTo: "https://untrusted.example/" }).returnTo,
    ).toBeUndefined();
  });

  it("retains validated athlete context when compose is closed to the inbox", () => {
    mocks.routeSearch.returnTo =
      "/organizations/11111111-1111-1111-1111-111111111111/athletes/22222222-2222-2222-2222-222222222222";
    const MessagesPage = (Route as unknown as { component: React.ComponentType }).component;
    const { rerender } = render(<MessagesPage />);

    const close = screen.getByRole("link", { name: "Close" });
    expect(JSON.parse(close.getAttribute("data-search") ?? "{}")).toMatchObject({
      compose: false,
      returnTo: mocks.routeSearch.returnTo,
    });
    mocks.routeSearch.compose = false;
    rerender(<MessagesPage />);
    expect(screen.getByRole("link", { name: "Return to athlete workspace" })).toBeTruthy();
    mocks.routeSearch.compose = true;
  });

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

  it("announces recipient selection, exposes pressed state, and removes a recipient", () => {
    const MessagesPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<MessagesPage />);

    const recipient = screen.getByRole("button", { name: /@second/i });
    fireEvent.click(recipient);
    expect(recipient.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("Added @second to recipients.");

    fireEvent.click(screen.getByRole("button", { name: "Remove @second from recipients" }));
    expect(screen.getByRole("status").textContent).toContain("Removed @second from recipients.");
  });

  it("clears recipient announcements for a new search and announces its loading and result states", () => {
    const MessagesPage = (Route as unknown as { component: React.ComponentType }).component;
    const { rerender } = render(<MessagesPage />);

    fireEvent.click(screen.getByRole("button", { name: /@second/i }));
    expect(screen.getByRole("status").textContent).toContain("Added @second to recipients.");

    mocks.searchFetching = true;
    fireEvent.change(screen.getByRole("searchbox", { name: "Search message recipients" }), {
      target: { value: "new search" },
    });
    rerender(<MessagesPage />);
    expect(screen.getByRole("status", { name: "Searching profiles" })).toBeTruthy();

    mocks.searchFetching = false;
    rerender(<MessagesPage />);
    expect(screen.getByRole("status").textContent).toContain("1 profile results available");
  });

  it("keeps recipient and group drafts visible when profile search fails and retries", () => {
    mocks.routeSearch.composeRecipients = [
      { id: "user-1", username: "rider", is_public: true, avatar_url: null },
      { id: "user-2", username: "second", is_public: true, avatar_url: null },
    ];
    mocks.searchError = true;
    const MessagesPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<MessagesPage />);

    expect(screen.getByRole("alert").textContent).toContain("Profiles could not be loaded");
    expect(screen.getByRole("button", { name: "Remove @rider from recipients" })).toBeTruthy();
    expect((screen.getByLabelText("Group name") as HTMLInputElement).value).toBe("Paceline");
    fireEvent.click(screen.getByRole("button", { name: "Retry search" }));
    expect(mocks.refetchSearch).toHaveBeenCalledOnce();
  });
});

describe("messages inbox state", () => {
  it("keeps an inbox failure distinct from an empty inbox and offers retry", () => {
    mocks.routeSearch.compose = false;
    mocks.inboxError = true;
    const MessagesPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<MessagesPage />);

    expect(screen.getByRole("alert").textContent).toContain("Conversations could not be loaded");
    expect(screen.queryByText("No conversations yet")).toBeNull();
    const retry = screen.getAllByRole("button", { name: "Retry inbox" })[0];
    if (!retry) throw new Error("Expected an inbox retry button");
    fireEvent.click(retry);
    expect(mocks.refetchInbox).toHaveBeenCalledOnce();
  });
});

describe("message send recovery", () => {
  it("reuses one operation ID for an unchanged retry and retires it after success", async () => {
    openConversation();
    mocks.sendMessage.mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValueOnce({
      success: true,
    });
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce("00000000-0000-4000-8000-000000000001");
    renderConversation();

    sendDraft("Same logical message");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Connection lost"));
    sendDraft("Same logical message");
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(2));
    expect(mocks.sendMessage.mock.calls.map(([input]) => input.operation_id)).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000001",
    ]);
    await waitFor(() =>
      expect((screen.getByPlaceholderText("Type a message...") as HTMLInputElement).value).toBe(""),
    );

    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce("00000000-0000-4000-8000-000000000002");
    sendDraft("Same logical message");
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(3));
    expect(mocks.sendMessage.mock.calls[2]?.[0].operation_id).toBe(
      "00000000-0000-4000-8000-000000000002",
    );
    expect(mocks.invalidateConversation).toHaveBeenCalledWith(expect.anything(), "conversation-a");
  });

  it("preserves a whitespace draft on failure and clears it after its successful retry", async () => {
    openConversation();
    mocks.sendMessage.mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValueOnce({
      success: true,
    });
    renderConversation();

    sendDraft("  Same logical message  ");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Connection lost"));
    expect((screen.getByPlaceholderText("Type a message...") as HTMLInputElement).value).toBe(
      "  Same logical message  ",
    );
    sendDraft("  Same logical message  ");
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(2));
    expect(mocks.sendMessage.mock.calls[0]?.[0].operation_id).toBe(
      mocks.sendMessage.mock.calls[1]?.[0].operation_id,
    );
    await waitFor(() =>
      expect((screen.getByPlaceholderText("Type a message...") as HTMLInputElement).value).toBe(""),
    );
  });

  it("keeps a confirmed send successful when refreshing its conversation fails", async () => {
    openConversation();
    mocks.sendMessage.mockResolvedValue({ success: true });
    mocks.invalidateConversation.mockRejectedValueOnce(new Error("Refresh unavailable"));
    renderConversation();

    sendDraft("Confirmed message");
    await waitFor(() =>
      expect((screen.getByPlaceholderText("Type a message...") as HTMLInputElement).value).toBe(""),
    );
    expect(mocks.invalidateConversation).toHaveBeenCalledWith(expect.anything(), "conversation-a");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.sendMessage).toHaveBeenCalledOnce();
    const firstId = mocks.sendMessage.mock.calls[0]?.[0].operation_id;

    sendDraft("Confirmed message");
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(2));
    expect(mocks.sendMessage.mock.calls[1]?.[0].operation_id).not.toBe(firstId);
    await waitFor(() =>
      expect((screen.getByPlaceholderText("Type a message...") as HTMLInputElement).value).toBe(""),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("refreshes the original conversation after success without clearing a newer draft", async () => {
    openConversation();
    let complete: (() => void) | undefined;
    const pending = new Promise((resolve) => {
      complete = () => resolve({ success: true });
    });
    mocks.sendMessage.mockReturnValueOnce(pending);
    renderConversation();
    sendDraft("Original");
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByPlaceholderText("Type a message..."), {
      target: { value: "New draft" },
    });

    await act(async () => {
      complete?.();
      await pending;
    });
    expect(mocks.invalidateConversation).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      "conversation-a",
    );
    expect((screen.getByPlaceholderText("Type a message...") as HTMLInputElement).value).toBe(
      "New draft",
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.sendMessage).toHaveBeenCalledOnce();
  });

  it("rotates the operation ID when draft content, conversation, or actor changes", async () => {
    openConversation("conversation-a");
    mocks.sendMessage.mockRejectedValue(new Error("Connection lost"));
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce("00000000-0000-4000-8000-000000000003");
    const MessagesPage = (Route as unknown as { component: React.ComponentType }).component;
    const { rerender } = renderConversation();

    sendDraft("Original");
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledOnce());
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce("00000000-0000-4000-8000-000000000004");
    sendDraft("Changed");
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(2));

    mocks.routeSearch.conversationId = "conversation-b";
    mocks.conversations = [
      {
        id: "conversation-b",
        is_group: false,
        group_name: null,
        last_message_at: null,
        last_message_content: null,
        participants: [],
        unread_count: 0,
      },
    ];
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce("00000000-0000-4000-8000-000000000005");
    rerender(<MessagesPage />);
    sendDraft("Changed");
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(3));

    mocks.actorId = "viewer-2";
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce("00000000-0000-4000-8000-000000000006");
    rerender(<MessagesPage />);
    sendDraft("Changed");
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(4));
    expect(mocks.sendMessage.mock.calls.map(([input]) => input.operation_id)).toEqual([
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000004",
      "00000000-0000-4000-8000-000000000005",
      "00000000-0000-4000-8000-000000000006",
    ]);
  });

  it("does not let a late completion overwrite a newer draft after returning to the same context", async () => {
    openConversation("conversation-a");
    let resolveFirst: (() => void) | undefined;
    const pending = new Promise((resolve) => {
      resolveFirst = () => resolve({ success: true });
    });
    mocks.sendMessage.mockReturnValueOnce(pending).mockResolvedValueOnce({ success: true });
    const MessagesPage = (Route as unknown as { component: React.ComponentType }).component;
    const { rerender } = renderConversation();

    sendDraft("Original");
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledOnce());
    mocks.routeSearch.conversationId = "conversation-b";
    mocks.conversations = [{ ...mocks.conversations[0], id: "conversation-b" }];
    rerender(<MessagesPage />);
    mocks.routeSearch.conversationId = "conversation-a";
    mocks.conversations = [{ ...mocks.conversations[0], id: "conversation-a" }];
    rerender(<MessagesPage />);
    fireEvent.change(screen.getByPlaceholderText("Type a message..."), {
      target: { value: "Original" },
    });
    await act(async () => {
      resolveFirst?.();
      await pending;
    });
    expect(mocks.invalidateConversation).toHaveBeenCalledWith(expect.anything(), "conversation-a");
    expect((screen.getByPlaceholderText("Type a message...") as HTMLInputElement).value).toBe(
      "Original",
    );
    const originalId = mocks.sendMessage.mock.calls[0]?.[0].operation_id;
    sendDraft("Original");
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(2));
    expect(mocks.sendMessage.mock.calls[1]?.[0].operation_id).not.toBe(originalId);
    await waitFor(() =>
      expect((screen.getByPlaceholderText("Type a message...") as HTMLInputElement).value).toBe(""),
    );
  });

  it("does not attach a late failure to a newer draft after a context round trip", async () => {
    openConversation("conversation-a");
    let rejectFirst: ((error: Error) => void) | undefined;
    const pending = new Promise((_, reject) => {
      rejectFirst = reject;
    });
    mocks.sendMessage.mockReturnValueOnce(pending);
    const MessagesPage = (Route as unknown as { component: React.ComponentType }).component;
    const { rerender } = renderConversation();

    sendDraft("Original");
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledOnce());
    mocks.routeSearch.conversationId = "conversation-b";
    mocks.conversations = [{ ...mocks.conversations[0], id: "conversation-b" }];
    rerender(<MessagesPage />);
    mocks.routeSearch.conversationId = "conversation-a";
    mocks.conversations = [{ ...mocks.conversations[0], id: "conversation-a" }];
    rerender(<MessagesPage />);
    fireEvent.change(screen.getByPlaceholderText("Type a message..."), {
      target: { value: "New draft" },
    });
    await act(async () => {
      rejectFirst?.(new Error("Old request failed"));
      await pending.catch(() => undefined);
    });
    expect((screen.getByPlaceholderText("Type a message...") as HTMLInputElement).value).toBe(
      "New draft",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
