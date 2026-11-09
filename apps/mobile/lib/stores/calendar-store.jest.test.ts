const getItemMock = jest.fn<Promise<string | null>, [string]>(async () => null);

async function waitFor(expectation: () => void, attempts = 10) {
  let lastError: unknown;

  for (let index = 0; index < attempts; index += 1) {
    try {
      expectation();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  throw lastError;
}

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: getItemMock,
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

describe("calendar store", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    getItemMock.mockResolvedValue(null);
  });

  it("finishes hydration when persisted calendar state cannot be read", async () => {
    getItemMock.mockRejectedValueOnce(new Error("storage unavailable"));

    const { useCalendarStore } = await import("./calendar-store");

    await waitFor(() => {
      expect(useCalendarStore.getState().hydrated).toBe(true);
      expect(useCalendarStore.getState().activeDate).toBeNull();
    });
  });
});
