import { skipToken } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";

const commonLoadQueryMock = jest.fn();
const queryRefetchMock = jest.fn(async () => ({ data: undefined }));
const profileRefetchMock = jest.fn(async () => ({ data: undefined }));
const appStateListeners: Array<(state: string) => void> = [];
let authState: {
  profile: { planning_timezone: string | null } | null;
  profileError: Error | null;
  profileLoading: boolean;
  refreshProfile: typeof profileRefetchMock;
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  AppState: {
    addEventListener: jest.fn((_event: string, listener: (state: string) => void) => {
      appStateListeners.push(listener);
      return { remove: jest.fn() };
    }),
  },
}));

jest.mock("react-native/Libraries/AppState/AppState", () => ({
  __esModule: true,
  AppState: {
    addEventListener: jest.fn((_event: string, listener: (state: string) => void) => {
      appStateListeners.push(listener);
      return { remove: jest.fn() };
    }),
  },
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    activities: {
      commonLoadHistory: {
        useQuery: (...args: unknown[]) => commonLoadQueryMock(...args),
      },
    },
  },
}));

jest.mock("../useAuth", () => ({
  __esModule: true,
  useAuth: () => authState,
}));

import {
  getCurrentPlanningDate,
  millisecondsUntilNextPlanningDay,
  useCommonLoadHistory,
} from "../useCommonLoadHistory";

describe("useCommonLoadHistory", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-22T06:59:00.000Z"));
    appStateListeners.length = 0;
    authState = {
      profile: { planning_timezone: "America/Los_Angeles" },
      profileError: null,
      profileLoading: false,
      refreshProfile: profileRefetchMock,
    };
    commonLoadQueryMock.mockReset();
    queryRefetchMock.mockClear();
    profileRefetchMock.mockClear();
    commonLoadQueryMock.mockReturnValue({
      data: undefined,
      error: null,
      isLoading: true,
      refetch: queryRefetchMock,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("derives the planning date at the persisted-zone boundary and uses exact API input", () => {
    expect(getCurrentPlanningDate(new Date(), "America/Los_Angeles")).toBe("2026-07-21");
    expect(millisecondsUntilNextPlanningDay(new Date(), "America/Los_Angeles")).toBe(60_000);

    renderHook(() => useCommonLoadHistory());

    expect(commonLoadQueryMock).toHaveBeenLastCalledWith({
      current_planning_date: "2026-07-21",
      planning_timezone: "America/Los_Angeles",
    });
  });

  it("refreshes the strict input at planning-zone midnight", () => {
    renderHook(() => useCommonLoadHistory());

    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(commonLoadQueryMock).toHaveBeenLastCalledWith({
      current_planning_date: "2026-07-22",
      planning_timezone: "America/Los_Angeles",
    });
  });

  it("does not postpone a planning boundary that is less than one minute away", () => {
    expect(
      millisecondsUntilNextPlanningDay(new Date("2026-07-22T06:59:30.000Z"), "America/Los_Angeles"),
    ).toBe(30_000);
  });

  it("finds the real boundary when a planning zone skips local midnight", () => {
    expect(
      millisecondsUntilNextPlanningDay(new Date("2011-12-30T09:59:30.000Z"), "Pacific/Apia"),
    ).toBe(30_000);
  });

  it("disables the query for a missing timezone and reports abstention, not error", () => {
    authState.profile = { planning_timezone: null };

    const { result } = renderHook(() => useCommonLoadHistory());

    expect(commonLoadQueryMock).toHaveBeenLastCalledWith(skipToken);
    expect(result.current).toMatchObject({
      status: "unavailable",
      reason: "missing_planning_timezone",
      error: null,
      isLoading: false,
    });
  });

  it("exposes an available common-load history response without reshaping it", () => {
    const data = {
      status: "available",
      points: [],
      policyVersion: "common_load_history_v1",
      identity: {},
    };
    commonLoadQueryMock.mockReturnValue({
      data,
      error: null,
      isLoading: false,
      refetch: queryRefetchMock,
    });

    const { result } = renderHook(() => useCommonLoadHistory());

    expect(result.current).toMatchObject({ status: "available", data, error: null });
  });

  it("keeps API abstention distinct from transport failure and never invents data", () => {
    const data = { status: "unavailable", reason: "insufficient_history" };
    commonLoadQueryMock.mockReturnValue({
      data,
      error: null,
      isLoading: false,
      refetch: queryRefetchMock,
    });

    const { result } = renderHook(() => useCommonLoadHistory());

    expect(result.current).toMatchObject({
      status: "unavailable",
      reason: "insufficient_history",
      data,
      error: null,
    });
  });

  it("preserves available cached history when a background refetch fails", () => {
    const backgroundError = new Error("refresh failed");
    const data = {
      status: "available",
      points: [],
      policyVersion: "common_load_history_v1",
      identity: {},
    };
    commonLoadQueryMock.mockReturnValue({
      data,
      error: backgroundError,
      isLoading: false,
      refetch: queryRefetchMock,
    });

    const { result } = renderHook(() => useCommonLoadHistory());

    expect(result.current).toMatchObject({
      status: "available",
      data,
      error: backgroundError,
    });
  });

  it("keeps a profile transport error distinct from a missing timezone", () => {
    authState.profile = null;
    authState.profileError = new Error("profile failed");

    const { result } = renderHook(() => useCommonLoadHistory());

    expect(commonLoadQueryMock).toHaveBeenLastCalledWith(skipToken);
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe(authState.profileError);
  });

  it("lets retry recover profile transport errors while the history query is disabled", async () => {
    authState.profile = null;
    authState.profileError = new Error("profile failed");
    const { result } = renderHook(() => useCommonLoadHistory());

    await act(async () => {
      await result.current.refetch();
    });

    expect(profileRefetchMock).toHaveBeenCalledTimes(1);
    expect(queryRefetchMock).not.toHaveBeenCalled();
  });

  it("abstains instead of throwing for an invalid persisted timezone", () => {
    authState.profile = { planning_timezone: "Invalid/Zone" };

    const { result } = renderHook(() => useCommonLoadHistory());

    expect(commonLoadQueryMock).toHaveBeenLastCalledWith(skipToken);
    expect(result.current).toMatchObject({
      status: "unavailable",
      reason: "invalid_planning_timezone",
    });
  });
});
