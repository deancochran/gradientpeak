const asyncStorageState = new Map<string, string>();
const appearanceSetColorSchemeMock = jest.fn();
const appearanceListenerMock = jest.fn();
const appearanceGetColorSchemeMock = jest.fn(() => "light");
const nativeCssSetColorSchemeMock = jest.fn();

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
    getItem: jest.fn(async (key: string) => asyncStorageState.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      asyncStorageState.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      asyncStorageState.delete(key);
    }),
  },
}));

jest.mock("react-native", () => ({
  Appearance: {
    addChangeListener: appearanceListenerMock,
    getColorScheme: appearanceGetColorSchemeMock,
    setColorScheme: appearanceSetColorSchemeMock,
  },
}));

jest.mock("react-native-css/native", () => ({
  __esModule: true,
  colorScheme: {
    set: nativeCssSetColorSchemeMock,
  },
}));

jest.mock("@/lib/theme", () => ({
  __esModule: true,
  resolveThemeMode: (preference: "system" | "light" | "dark", systemColorScheme = "light") =>
    preference === "system" ? (systemColorScheme === "dark" ? "dark" : "light") : preference,
}));

describe("theme store", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    asyncStorageState.clear();
    appearanceGetColorSchemeMock.mockReturnValue("light");
  });

  it("initializes from the rehydrated persisted preference", async () => {
    asyncStorageState.set(
      "gradientpeak-theme-store",
      JSON.stringify({ state: { userPreference: "dark" }, version: 0 }),
    );

    const { useThemeStore } = await import("./theme-store");

    await waitFor(() => {
      expect(useThemeStore.getState().userPreference).toBe("dark");
      expect(useThemeStore.getState().resolvedTheme).toBe("dark");
      expect(nativeCssSetColorSchemeMock).toHaveBeenCalledWith("dark");
      expect(appearanceSetColorSchemeMock).toHaveBeenCalledWith("dark");
    });
  });

  it("persists through zustand storage when the theme changes", async () => {
    const { useThemeStore } = await import("./theme-store");

    await useThemeStore.getState().setTheme("dark");

    expect(useThemeStore.getState().userPreference).toBe("dark");
    expect(useThemeStore.getState().resolvedTheme).toBe("dark");
    expect(nativeCssSetColorSchemeMock).toHaveBeenCalledWith("dark");
    expect(appearanceSetColorSchemeMock).toHaveBeenCalledWith("dark");
    expect(asyncStorageState.get("gradientpeak-theme-store")).toContain('"userPreference":"dark"');
    expect(asyncStorageState.has("@theme_preference")).toBe(false);
  });
});
