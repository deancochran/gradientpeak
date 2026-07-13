import { act, renderHook } from "@testing-library/react-native";
import { useLocalTodayKey } from "../useLocalTodayKey";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

describe("useLocalTodayKey", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("updates after the device crosses local midnight", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 6, 13, 23, 59, 30));

    const { result } = renderHook(() => useLocalTodayKey());
    expect(result.current).toBe("2026-07-13");

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    expect(result.current).toBe("2026-07-14");
  });
});
