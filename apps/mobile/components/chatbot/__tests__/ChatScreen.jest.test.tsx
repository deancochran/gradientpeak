import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../test/render-native";

const send = jest.fn();
const stop = jest.fn();
const recover = jest.fn();
const retryPending = jest.fn();
const newConversation = jest.fn();
const refresh = jest.fn();
let draft = "";
let foregroundListener: (() => void) | undefined;
let focusCleanup: (() => void) | undefined;
type TestState = {
  status: string;
  messages: unknown[];
  activities: unknown[];
  canSend: boolean;
  canRecover: boolean;
  canRetryPending: boolean;
  pending?: { text: string; threadId?: string; turnId?: string };
};
let state: TestState = {
  status: "idle",
  messages: [],
  activities: [],
  canSend: true,
  canRecover: false,
  canRetryPending: false,
};
const controller = {
  actorId: "actor-a",
  getState: () => state,
  subscribe: () => () => {},
  send,
  stop,
  recover,
  retryPending,
  newConversation,
  refresh,
};
let getController: (actorId: string) => Promise<typeof controller> = async () => controller;

jest.mock("@repo/ui/components/button", () => ({ Button: createHost("Button") }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@repo/ui/components/textarea", () => ({ Textarea: createHost("Textarea") }));
jest.mock("react-native", () => ({
  ...jest.requireActual("@repo/ui/test/react-native"),
  KeyboardAvoidingView: createHost("KeyboardAvoidingView"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
  Platform: { OS: "android" },
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock("expo-router", () => {
  const React = require("react");
  return {
    useFocusEffect: (effect: () => (() => void) | undefined) =>
      React.useEffect(() => {
        focusCleanup = effect();
        return () => {
          focusCleanup?.();
          focusCleanup = undefined;
        };
      }, [effect]),
  };
});
jest.mock("@/lib/chatbot/controller", () => ({
  getChatbotController: (actorId: string) => getController(actorId),
  getChatbotDraft: () => draft,
  setChatbotDraft: (_actorId: string, next: string) => {
    draft = next;
  },
  isAccepted: (next: { status: string }) =>
    next.status === "streaming" || next.status === "completed",
  subscribeToForeground: (next: typeof controller) => {
    next.refresh();
    foregroundListener = () => next.refresh();
    return () => {
      foregroundListener = undefined;
    };
  },
}));

const { ChatScreen } = require("../ChatScreen");

describe("ChatScreen", () => {
  it("offers explicit retry when secure recovery storage cannot load", async () => {
    getController = async () => {
      throw new Error("storage unavailable");
    };
    await renderNative(<ChatScreen actorId="actor-a" />);
    await waitFor(() => expect(screen.getByLabelText("Retry loading conversation")).toBeTruthy());
    getController = async () => controller;
    await fireEvent.press(screen.getByLabelText("Retry loading conversation"));
    await waitFor(() => expect(screen.queryByLabelText("Retry loading conversation")).toBeNull());
  });
  beforeEach(() => {
    send.mockReset();
    stop.mockReset();
    recover.mockReset();
    retryPending.mockReset();
    newConversation.mockReset();
    refresh.mockReset();
    draft = "";
    getController = async () => controller;
    foregroundListener = undefined;
    focusCleanup = undefined;
    state = {
      status: "idle",
      messages: [],
      activities: [],
      canSend: true,
      canRecover: false,
      canRetryPending: false,
    };
  });

  it("composes and submits an enabled message while empty drafts remain disabled", async () => {
    await renderNative(<ChatScreen actorId="actor-a" />);
    expect(screen.getByTestId("chat-send").props.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId("chat-composer"), "Help plan tomorrow");
    await fireEvent.press(screen.getByTestId("chat-send"));
    expect(send).toHaveBeenCalledWith("Help plan tomorrow", expect.any(Function));
  });

  it("clears only the unchanged draft after durable request acceptance", async () => {
    send.mockImplementation((_text, onAccepted) => {
      state = { ...state, status: "streaming", canSend: false };
      onAccepted();
    });
    await renderNative(<ChatScreen actorId="actor-a" />);
    await fireEvent.changeText(screen.getByTestId("chat-composer"), "Keep this unless accepted");
    await fireEvent.press(screen.getByTestId("chat-send"));

    expect(draft).toBe("");
  });

  it("keeps text entered after submission when the request is later accepted", async () => {
    let accept: (() => void) | undefined;
    send.mockImplementation((_text, onAccepted) => {
      accept = onAccepted;
    });
    await renderNative(<ChatScreen actorId="actor-a" />);
    await fireEvent.changeText(screen.getByTestId("chat-composer"), "Original request");
    await fireEvent.press(screen.getByTestId("chat-send"));
    draft = "Later edit";

    accept?.();

    expect(draft).toBe("Later edit");
  });

  it("renders no prior-account conversation or draft while the next controller is loading", async () => {
    draft = "Account A private draft";
    state = {
      ...state,
      messages: [{ id: "a-message", role: "user", text: "Account A private message" }],
    };
    getController = (actorId: string) =>
      actorId === "actor-b" ? new Promise(() => {}) : Promise.resolve(controller);

    const view = await renderNative(<ChatScreen actorId="actor-a" />);
    await waitFor(() => expect(screen.getByText("Account A private message")).toBeTruthy());
    await view.rerender(<ChatScreen actorId="actor-b" />);

    expect(screen.queryByText("Account A private message")).toBeNull();
    expect(screen.getByTestId("chat-composer").props.value).toBe("");
    expect(screen.getByTestId("chat-send").props.disabled).toBe(true);
  });

  it("does not refresh after focus cleanup when the app returns to foreground", async () => {
    await renderNative(<ChatScreen actorId="actor-a" />);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    focusCleanup?.();
    foregroundListener?.();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("offers stop, recovery, retry, and new conversation controls for their explicit states", async () => {
    state = {
      status: "streaming",
      messages: [],
      activities: [],
      canSend: false,
      canRecover: false,
      canRetryPending: false,
      pending: { text: "x" },
    };
    await renderNative(<ChatScreen actorId="actor-a" />);
    await fireEvent.press(screen.getByTestId("chat-stop"));
    expect(stop).toHaveBeenCalled();
    state = {
      status: "unknown",
      messages: [],
      activities: [],
      canSend: false,
      canRecover: true,
      canRetryPending: true,
      pending: { text: "x", threadId: "t", turnId: "u" },
    };
    await renderNative(<ChatScreen actorId="actor-a" />);
    await fireEvent.press(screen.getByLabelText("Recover assistant request"));
    expect(screen.queryByLabelText("Retry assistant request")).toBeNull();
    state = {
      ...state,
      canRecover: false,
    };
    await renderNative(<ChatScreen actorId="actor-a" />);
    await fireEvent.press(screen.getByLabelText("Retry assistant request"));
    expect(recover).toHaveBeenCalled();
    expect(retryPending).toHaveBeenCalled();
    state = {
      status: "idle",
      messages: [],
      activities: [],
      canSend: true,
      canRecover: false,
      canRetryPending: false,
    };
    await renderNative(<ChatScreen actorId="actor-a" />);
    await fireEvent.press(screen.getByLabelText("Start new assistant conversation"));
    expect(newConversation).toHaveBeenCalled();
  });
});
