const asyncStorageState = new Map<string, string>();

async function waitFor(expectation: () => void, attempts = 20) {
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
    getItem: jest.fn(async (key: string) => asyncStorageState.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => asyncStorageState.set(key, value)),
    removeItem: jest.fn(async (key: string) => asyncStorageState.delete(key)),
  },
}));

describe("PlanDisplayPreferences", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    asyncStorageState.clear();
  });

  it("hydrates the persisted range and keeps it across a store remount", async () => {
    const first = await import("./planDisplayPreferences");
    first.usePlanDisplayPreferences.getState().setRange("monthly");
    await waitFor(() =>
      expect(asyncStorageState.get(first.PLAN_DISPLAY_PREFERENCES_STORAGE_KEY)).toContain(
        '"range":"monthly"',
      ),
    );

    jest.resetModules();
    const remounted = await import("./planDisplayPreferences");
    await waitFor(() =>
      expect(remounted.usePlanDisplayPreferences.getState().range).toBe("monthly"),
    );
  });

  it("falls back safely when persisted input is invalid", async () => {
    asyncStorageState.set(
      "gradientpeak-plan-display-preferences",
      JSON.stringify({
        state: { range: "yearly", selectedDate: "private-transient-value" },
        version: 1,
      }),
    );

    const { usePlanDisplayPreferences } = await import("./planDisplayPreferences");

    await waitFor(() => expect(usePlanDisplayPreferences.getState().hydrated).toBe(true));
    expect(usePlanDisplayPreferences.getState().hydrated).toBe(true);
    expect(usePlanDisplayPreferences.getState().range).toBe("daily");
    expect(usePlanDisplayPreferences.getState()).not.toHaveProperty("selectedDate");
  });

  it("preserves a user choice made while hydration is pending", async () => {
    let resolveRead: ((value: string | null) => void) | undefined;
    const storage = (await import("@react-native-async-storage/async-storage")).default;
    jest
      .mocked(storage.getItem)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveRead = resolve)));

    const { usePlanDisplayPreferences } = await import("./planDisplayPreferences");
    usePlanDisplayPreferences.getState().setRange("monthly");
    expect(storage.setItem).not.toHaveBeenCalled();
    resolveRead?.(JSON.stringify({ state: { range: "weekly" }, version: 1 }));

    await waitFor(() => expect(usePlanDisplayPreferences.getState().hydrated).toBe(true));
    expect(usePlanDisplayPreferences.getState().range).toBe("monthly");
  });
});
