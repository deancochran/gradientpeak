import { act, renderHook } from "@testing-library/react-native";

const commonLoadQueryMock = jest.fn();
const queryRefetchMock = jest.fn(async () => ({ data: undefined }));

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

import { useCommonLoadHistory } from "../useCommonLoadHistory";

describe("useCommonLoadHistory", () => {
  beforeEach(() => {
    commonLoadQueryMock.mockReset();
    queryRefetchMock.mockClear();
    commonLoadQueryMock.mockReturnValue({
      data: undefined,
      error: null,
      isLoading: true,
      refetch: queryRefetchMock,
    });
  });

  it("queries the server-owned planning boundary without device input", () => {
    renderHook(() => useCommonLoadHistory());

    expect(commonLoadQueryMock).toHaveBeenLastCalledWith();
  });

  it("exposes available history and its authoritative identity", () => {
    const data = {
      status: "available",
      points: [],
      policyVersion: "common_load_history_v1",
      coverageStatus: "partial",
      identity: {
        endDate: "2026-07-21",
        planningTimezone: "America/Los_Angeles",
      },
    };
    commonLoadQueryMock.mockReturnValue({
      data,
      error: null,
      isLoading: false,
      refetch: queryRefetchMock,
    });

    const { result } = renderHook(() => useCommonLoadHistory());

    expect(result.current).toMatchObject({
      status: "available",
      currentPlanningDate: "2026-07-22",
      planningTimezone: "America/Los_Angeles",
      data,
      error: null,
    });
  });

  it("keeps API abstention distinct from transport failure", () => {
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
      coverageStatus: "complete",
      identity: { endDate: "2026-07-21", planningTimezone: "UTC" },
    };
    commonLoadQueryMock.mockReturnValue({
      data,
      error: backgroundError,
      isLoading: false,
      refetch: queryRefetchMock,
    });

    const { result } = renderHook(() => useCommonLoadHistory());

    expect(result.current).toMatchObject({ status: "available", data, error: backgroundError });
  });

  it("reports transport errors and retries the history query", async () => {
    const error = new Error("history failed");
    commonLoadQueryMock.mockReturnValue({
      data: undefined,
      error,
      isLoading: false,
      refetch: queryRefetchMock,
    });
    const { result } = renderHook(() => useCommonLoadHistory());

    expect(result.current).toMatchObject({ status: "error", error });
    await act(async () => {
      await result.current.refetch();
    });
    expect(queryRefetchMock).toHaveBeenCalledTimes(1);
  });
});
