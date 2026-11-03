// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatbotLauncher } from "./chatbot-panel";

const requestId = "11111111-1111-4111-8111-111111111111";
const threadId = "22222222-2222-4222-8222-222222222222";
const turnId = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  actorId: "actor-a" as string | null,
  client: {
    newConversation: vi.fn(),
    recover: vi.fn(),
    refresh: vi.fn(),
    retryPending: vi.fn(),
    stop: vi.fn(),
  },
  send: vi.fn<(text: string, onAccepted?: () => void) => Promise<void>>(async () => undefined),
  state: {
    activities: [],
    canRecover: false,
    canRetryPending: false,
    canSend: true,
    messages: [],
    status: "idle",
  },
}));

vi.mock("../providers/auth-provider", () => ({
  useAuth: () => ({ user: mocks.actorId ? { id: mocks.actorId } : null }),
}));
vi.mock("./use-chatbot", () => ({
  useChatbot: () => ({ client: mocks.client, send: mocks.send, state: mocks.state }),
}));

function setState(patch: Record<string, unknown> = {}) {
  mocks.state = {
    activities: [],
    canRecover: false,
    canRetryPending: false,
    canSend: true,
    messages: [],
    status: "idle",
    ...patch,
  };
}

beforeEach(() => {
  mocks.actorId = "actor-a";
  mocks.send.mockClear();
  for (const mock of Object.values(mocks.client)) mock.mockClear();
  setState();
});
afterEach(async () => {
  cleanup();
  // Radix restores focus in a deferred unmount callback. Let it finish before
  // Vitest disposes this DOM and restores the global Event constructors.
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
});

describe("ChatbotLauncher", () => {
  it("opens a narrow-screen-width sheet, focuses the composer, and restores focus on Escape", async () => {
    render(<ChatbotLauncher />);
    const trigger = screen.getByRole("button", { name: "Assistant" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Assistant" });
    expect(dialog.className).toContain("w-full");
    expect(dialog.className).toContain("sm:w-[28rem]");
    const composer = screen.getByLabelText("Message assistant");
    await waitFor(() => expect(document.activeElement).toBe(composer));

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("preserves a draft while closed, clears it for a changed actor, and renders nothing unauthenticated", async () => {
    const view = render(<ChatbotLauncher />);
    fireEvent.click(screen.getByRole("button", { name: "Assistant" }));
    const composer = await screen.findByLabelText("Message assistant");
    fireEvent.change(composer, { target: { value: "Private training detail" } });
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Assistant" }));
    expect(
      (await screen.findByLabelText("Message assistant")) as HTMLTextAreaElement,
    ).toHaveProperty("value", "Private training detail");

    mocks.actorId = "actor-b";
    view.rerender(<ChatbotLauncher />);
    expect(screen.getByLabelText("Message assistant")).toHaveProperty("value", "");

    mocks.actorId = null;
    view.rerender(<ChatbotLauncher />);
    expect(screen.queryByRole("button", { name: "Assistant" })).toBeNull();
  });

  it("submits only a plain Enter, exposes streaming stop, and labels recoverable conflicts", async () => {
    const view = render(<ChatbotLauncher />);
    fireEvent.click(screen.getByRole("button", { name: "Assistant" }));
    const composer = await screen.findByLabelText("Message assistant");
    fireEvent.change(composer, { target: { value: "Help me train" } });
    fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(composer, { key: "Enter", isComposing: true });
    expect(mocks.send).not.toHaveBeenCalled();
    fireEvent.keyDown(composer, { key: "Enter" });
    await waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith("Help me train", expect.any(Function)),
    );

    setState({
      canSend: false,
      pending: { requestId, text: "Help me train", threadId, turnId },
      status: "streaming",
    });
    view.rerender(<ChatbotLauncher />);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(mocks.client.stop).toHaveBeenCalledOnce();

    setState({
      canRecover: true,
      canSend: false,
      error: { code: "conflict" },
      pending: { requestId, text: "Help me train", threadId, turnId },
      status: "unknown",
    });
    view.rerender(<ChatbotLauncher />);
    expect(
      screen.getByText(
        "Request interrupted. Check its status or recover it before sending another message.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Recover request" }));
    expect(mocks.client.recover).toHaveBeenCalledOnce();
  });

  it("does not jump a reader who has scrolled away from new messages", () => {
    const view = render(<ChatbotLauncher />);
    fireEvent.click(screen.getByRole("button", { name: "Assistant" }));
    const conversation = screen.getByLabelText("Assistant conversation");
    const scrollTo = vi.fn();
    Object.defineProperties(conversation, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
      scrollTo: { configurable: true, value: scrollTo },
      scrollTop: { configurable: true, value: 0, writable: true },
    });
    fireEvent.scroll(conversation);

    act(() => {
      setState({ messages: [{ id: "assistant:1", role: "assistant", text: "Partial answer" }] });
      view.rerender(<ChatbotLauncher />);
    });

    expect(scrollTo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Jump to latest" }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 500 });
  });

  it("clears only the accepted draft and follows streaming text growth near the bottom", async () => {
    mocks.send.mockImplementation(async (_text: string, accepted?: () => void) => accepted?.());
    const view = render(<ChatbotLauncher />);
    fireEvent.click(screen.getByRole("button", { name: "Assistant" }));
    const composer = await screen.findByLabelText("Message assistant");
    fireEvent.change(composer, { target: { value: "Keep this only until accepted" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(composer).toHaveProperty("value", ""));

    const conversation = screen.getByLabelText("Assistant conversation");
    const scrollTo = vi.fn();
    Object.defineProperties(conversation, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
      scrollTo: { configurable: true, value: scrollTo },
      scrollTop: { configurable: true, value: 400, writable: true },
    });
    fireEvent.scroll(conversation);
    act(() => {
      setState({ messages: [{ id: "assistant:1", role: "assistant", text: "Part" }] });
      view.rerender(<ChatbotLauncher />);
    });
    scrollTo.mockClear();
    act(() => {
      setState({ messages: [{ id: "assistant:1", role: "assistant", text: "Partial answer" }] });
      view.rerender(<ChatbotLauncher />);
    });
    expect(scrollTo).toHaveBeenCalledWith({ top: 500 });
  });
});
