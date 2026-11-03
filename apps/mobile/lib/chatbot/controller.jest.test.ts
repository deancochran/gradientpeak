const mockStore = new Map<string, string>();
const getItemAsyncOrThrow = jest.fn(async (key: string) => mockStore.get(key) ?? null);
const setItemAsyncOrThrow = jest.fn(async (key: string, value: string) => {
  mockStore.set(key, value);
});
const deleteItemAsyncOrThrow = jest.fn(async (key: string) => {
  mockStore.delete(key);
});
let authListener: ((state: { user: { id: string } | null }) => void) | undefined;
let appStateListener: ((state: "active" | "background" | "inactive") => void) | undefined;

jest.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000000" }));
jest.mock("@repo/api/chatbot/client", () => ({
  createChatbotClient: () => ({
    getState: () => ({ status: "idle" }),
    subscribe: () => () => {},
    send: jest.fn(),
    retryPending: jest.fn(),
    refresh: jest.fn(),
    recover: jest.fn(),
    stop: jest.fn(),
    newConversation: jest.fn(),
    dispose: jest.fn(),
  }),
}));
jest.mock("react-native", () => ({
  AppState: {
    addEventListener: (_event: string, listener: typeof appStateListener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    },
  },
}));
jest.mock("@/lib/api", () => ({ createMobileHeaders: async () => new Headers() }));
jest.mock("@/lib/server-config", () => ({
  getServerConfig: () => ({ apiUrl: "https://api.example.test" }),
}));
jest.mock("@/lib/storage/safe-secure-store", () => ({
  safeSecureStore: { getItemAsyncOrThrow, setItemAsyncOrThrow, deleteItemAsyncOrThrow },
}));
jest.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: Object.assign(() => ({}), {
    getState: () => ({ user: { id: "actor-a" } }),
    subscribe: (listener: typeof authListener) => {
      authListener = listener;
      return () => {};
    },
  }),
}));

const {
  createChatbotPersistence,
  disposeChatbotControllerForActor,
  getChatbotController,
  subscribeToForeground,
} = require("./controller");

describe("chatbot controller account lifecycle", () => {
  beforeEach(() => {
    mockStore.clear();
    getItemAsyncOrThrow.mockReset();
    getItemAsyncOrThrow.mockImplementation(async (key: string) => mockStore.get(key) ?? null);
    setItemAsyncOrThrow.mockReset();
    setItemAsyncOrThrow.mockImplementation(async (key: string, value: string) => {
      mockStore.set(key, value);
    });
    deleteItemAsyncOrThrow.mockReset();
    deleteItemAsyncOrThrow.mockImplementation(async (key: string) => {
      mockStore.delete(key);
    });
  });

  it("disposes and clears an actor snapshot on logout", async () => {
    await getChatbotController("actor-a");
    authListener?.({ user: null });
    await new Promise(setImmediate);
    expect(deleteItemAsyncOrThrow).toHaveBeenCalledWith("chatbot.pending.actor-a");
  });

  it("round-trips a 4,000-character Unicode pending prompt without truncation", async () => {
    const persistence = createChatbotPersistence("actor-unicode");
    const text = "🧗".repeat(4000);
    const snapshot = { pending: { requestId: "request", text } };

    await persistence.save(snapshot);

    await expect(persistence.load()).resolves.toEqual(snapshot);
    expect(
      [...mockStore.keys()].some((key) => key.startsWith("chatbot.pending.actor-unicode.")),
    ).toBe(true);
  });

  it("keeps the prior committed snapshot if a new chunk write fails", async () => {
    const persistence = createChatbotPersistence("actor-atomic");
    const first = { pending: { requestId: "first", text: "first" } };
    await persistence.save(first);
    setItemAsyncOrThrow.mockRejectedValueOnce(new Error("locked"));

    await expect(
      persistence.save({ pending: { requestId: "second", text: "🧗".repeat(1000) } }),
    ).rejects.toThrow("locked");

    await expect(persistence.load()).resolves.toEqual(first);
  });

  it("does not resurrect a snapshot when logout begins during a deferred chunk write", async () => {
    const actorId = "actor-race";
    const persistence = createChatbotPersistence(actorId);
    let releaseChunkWrite: (() => void) | undefined;
    let chunkWriteStarted: (() => void) | undefined;
    const chunkWriteStartedPromise = new Promise<void>((resolve) => {
      chunkWriteStarted = resolve;
    });
    setItemAsyncOrThrow.mockImplementation(async (key: string, value: string) => {
      if (key === `chatbot.pending.${actorId}.a.0`) {
        chunkWriteStarted?.();
        await new Promise<void>((resolve) => {
          releaseChunkWrite = resolve;
        });
      }
      mockStore.set(key, value);
    });

    const save = persistence.save({ pending: { requestId: "race", text: "do not restore" } });
    await chunkWriteStartedPromise;
    const logout = disposeChatbotControllerForActor(actorId);
    releaseChunkWrite?.();

    await expect(save).rejects.toThrow("invalidated");
    await logout;
    expect(
      [...mockStore.keys()].filter((key) => key.startsWith(`chatbot.pending.${actorId}`)),
    ).toEqual([]);
    await expect(persistence.load()).resolves.toEqual({});
  });

  it("accepts a committed save when obsolete-slot cleanup fails", async () => {
    const persistence = createChatbotPersistence("actor-cleanup");
    await persistence.save({ pending: { requestId: "first", text: "first" } });
    deleteItemAsyncOrThrow.mockImplementation(async (key: string) => {
      if (key === "chatbot.pending.actor-cleanup.a.0") throw new Error("cleanup locked");
      mockStore.delete(key);
    });
    const second = { pending: { requestId: "second", text: "second" } };

    await expect(persistence.save(second)).resolves.toBeUndefined();
    await expect(persistence.load()).resolves.toEqual(second);
  });

  it("refreshes restored status on foreground and stops active transport in the background", () => {
    const refresh = jest.fn();
    const stop = jest.fn();
    const remove = subscribeToForeground(
      { refresh, stop },
      {
        addEventListener: (_event: string, listener: typeof appStateListener) => {
          appStateListener = listener;
          return { remove: jest.fn() };
        },
      },
    );

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(appStateListener).toEqual(expect.any(Function));
    appStateListener?.("background");
    appStateListener?.("active");
    expect(stop).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(2);
    remove();
  });
});
