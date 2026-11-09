import { act, renderHook } from "@testing-library/react-native";

const commonLoadQueryMock = jest.fn();
const queryRefetchMock = jest.fn(async () => ({ data: undefined }));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    profiles: { get: { useQuery: () => ({ data: { id: "profile-1" } }) } },
    athleteIntelligence: {
      getReadModel: {
        useQuery: (...args: unknown[]) => {
          const query = commonLoadQueryMock(...args);
          return {
            ...query,
            data: query.data ? { loadHistory: { result: query.data } } : undefined,
          };
        },
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

  it("queries the server-owned planning boundary without device input", async () => {
    await renderHook(() => useCommonLoadHistory());

    expect(commonLoadQueryMock).toHaveBeenLastCalledWith(
      {
        profileId: "profile-1",
        sections: {
          status: true,
          currentBaseline: { includePlanningContext: false },
          loadHistory: true,
        },
      },
      { enabled: true },
    );
  });

  it("exposes available history and its authoritative identity", async () => {
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

    const { result } = await renderHook(() => useCommonLoadHistory());

    expect(result.current).toMatchObject({
      status: "available",
      currentPlanningDate: "2026-07-22",
      planningTimezone: "America/Los_Angeles",
      data,
      error: null,
    });
  });

  it("keeps API abstention distinct from transport failure", async () => {
    const data = { status: "unavailable", reason: "insufficient_history" };
    commonLoadQueryMock.mockReturnValue({
      data,
      error: null,
      isLoading: false,
      refetch: queryRefetchMock,
    });

    const { result } = await renderHook(() => useCommonLoadHistory());

    expect(result.current).toMatchObject({
      status: "unavailable",
      reason: "insufficient_history",
      data,
      error: null,
    });
  });

  it("preserves available cached history when a background refetch fails", async () => {
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

    const { result } = await renderHook(() => useCommonLoadHistory());

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
    const { result } = await renderHook(() => useCommonLoadHistory());

    expect(result.current).toMatchObject({ status: "error", error });
    await act(async () => {
      await result.current.refetch();
    });
    expect(queryRefetchMock).toHaveBeenCalledTimes(1);
  });
});
