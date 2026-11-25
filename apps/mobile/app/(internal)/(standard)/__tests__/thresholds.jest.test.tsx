import { fireEvent } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { createHost } from "../../../../test/mock-components";
import { act, renderNative, screen, waitFor } from "../../../../test/render-native";

const navigate = jest.fn();
const useQuery = jest.fn();
const paginationState = {
  olderData: null as unknown,
  olderIsError: false,
  olderRefetch: jest.fn(),
  overviewData: null as unknown,
  overviewRefetch: jest.fn(),
  requestedInputs: [] as unknown[],
};

jest.mock("expo-router", () => ({ useRouter: () => ({ navigate }) }));
jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@repo/ui/components/card", () => ({
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));
jest.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));
jest.mock("@/components/shared/ScreenState", () => ({
  ErrorState: createHost("ErrorState"),
  LoadingState: createHost("LoadingState"),
}));
jest.mock("@/lib/api", () => ({
  api: {
    athleteIntelligence: {
      getThresholdOverview: { useQuery: (...args: unknown[]) => useQuery(...args) },
    },
  },
}));

const ThresholdsScreen = require("../thresholds").default;

afterEach(() => {
  navigate.mockReset();
  paginationState.olderData = null;
  paginationState.olderIsError = false;
  paginationState.olderRefetch.mockReset();
  paginationState.overviewData = null;
  paginationState.overviewRefetch.mockReset();
  paginationState.requestedInputs = [];
  useQuery.mockReset();
});

function mockPaginationQueries() {
  useQuery.mockImplementation((input: unknown, options?: { enabled?: boolean }) => {
    if (options && "enabled" in options) {
      paginationState.requestedInputs.push(input);
      return {
        data: paginationState.olderData,
        isError: paginationState.olderIsError,
        isLoading: false,
        refetch: paginationState.olderRefetch,
      };
    }
    return {
      data: paginationState.overviewData,
      isError: false,
      isLoading: false,
      refetch: paginationState.overviewRefetch,
    };
  });
}

function historyPoint(thresholdId: string, value: number) {
  return {
    activityCategory: "bike",
    confidence: 0.8,
    effectiveAt: "2026-05-01T00:00:00.000Z",
    method: "bike_power_30m",
    metric: "power",
    policyVersion: "threshold-policy-v2",
    sourceActivities: [],
    thresholdId,
    unit: "watts",
    value,
  };
}

it("renders threshold progression metadata and opens source activities", async () => {
  useQuery.mockReturnValue({
    data: {
      publication: { status: "available", publishedRevision: 4 },
      current: {
        thresholds: {
          bike: {
            status: "available",
            value: 250,
            unit: "watts",
            freshness: "fresh",
            effectiveAt: "2026-04-10T00:00:00.000Z",
            method: "bike_power_30m",
            confidence: 0.8,
          },
          run: {
            status: "available",
            value: 4,
            unit: "meters_per_second",
            freshness: "stale",
            effectiveAt: "2026-04-09T00:00:00.000Z",
            method: "run_pace_30m",
            confidence: 0.7,
          },
          swim: { status: "unavailable" },
        },
      },
      history: {
        items: [
          {
            thresholdId: "threshold-1",
            activityCategory: "bike",
            metric: "power",
            unit: "watts",
            value: 245,
            effectiveAt: "2026-03-10T00:00:00.000Z",
            method: "bike_power_30m",
            confidence: 0.75,
            policyVersion: "threshold-policy-v1",
            sourceActivities: [
              {
                id: "activity-1",
                name: "Threshold ride",
                finishedAt: "2026-03-10T00:00:00.000Z",
              },
            ],
          },
        ],
      },
    },
    isError: false,
    isLoading: false,
  });

  await renderNative(<ThresholdsScreen />);
  expect(useQuery).toHaveBeenCalledWith({ historyLimit: 100 });
  expect(screen.getByText("Publication available · revision 4")).toBeTruthy();
  expect(screen.getByText("250 W")).toBeTruthy();
  expect(screen.getByText("4:10 /km")).toBeTruthy();
  expect(
    screen.container.queryAll(
      (node) => node.props.testID === "threshold-history-chart-bike:power:watts",
    )[0],
  ).toBeTruthy();
  expect(
    screen.getByText("bike power 30m · 75% confidence · policy threshold-policy-v1"),
  ).toBeTruthy();
  await fireEvent.press(screen.getByTestId("threshold-source-activity-activity-1"));
  expect(navigate).toHaveBeenCalledWith("/activity-detail?id=activity-1");
});

it("keeps bike power and LTHR evidence in separate charts and reports incomplete history", async () => {
  useQuery.mockReturnValue({
    data: {
      publication: { status: "stale", publishedRevision: 4 },
      current: {
        thresholds: {
          bike: { status: "unavailable" },
          run: { status: "unavailable" },
          swim: { status: "unavailable" },
        },
      },
      history: {
        nextCursor: {
          createdAt: "2026-01-01T00:00:00.000Z",
          effectiveAt: "2026-01-01T00:00:00.000Z",
          thresholdId: "older",
        },
        items: [
          {
            thresholdId: "power",
            activityCategory: "bike",
            metric: "power",
            unit: "watts",
            value: 250,
            effectiveAt: "2026-04-10T00:00:00.000Z",
            method: "bike_power_30m",
            confidence: 0.8,
            policyVersion: "threshold-policy-v1",
            sourceActivities: [],
          },
          {
            thresholdId: "lthr",
            activityCategory: "bike",
            metric: "lthr",
            unit: "bpm",
            value: 165,
            effectiveAt: "2026-04-11T00:00:00.000Z",
            method: "lthr_30m_final_20m",
            confidence: 0.8,
            policyVersion: "threshold-policy-v1",
            sourceActivities: [],
          },
        ],
      },
    },
    isError: false,
    isLoading: false,
  });
  await renderNative(<ThresholdsScreen />);

  expect(screen.getByLabelText(/bike power history with 1 chronological records/i)).toBeTruthy();
  expect(screen.getByLabelText(/bike LTHR history with 1 chronological records/i)).toBeTruthy();
  expect(screen.getByTestId("threshold-history-load-earlier")).toBeTruthy();
});

it("loads the advertised cursor, retains first-page history facts, and appends earlier history", async () => {
  const cursor = {
    createdAt: "2026-02-01T00:00:00.000Z",
    effectiveAt: "2026-02-01T00:00:00.000Z",
    thresholdId: "older-cursor",
  };
  const secondCursor = {
    createdAt: "2026-01-01T00:00:00.000Z",
    effectiveAt: "2026-01-01T00:00:00.000Z",
    thresholdId: "oldest-cursor",
  };
  paginationState.overviewData = {
    publication: { status: "available", publishedRevision: 1, computedAt: "2026-05-01T00:00:00Z" },
    current: {
      thresholds: {
        bike: { status: "unavailable" },
        run: { status: "unavailable" },
        swim: { status: "unavailable" },
      },
    },
    history: { items: [historyPoint("current", 250)], nextCursor: cursor },
  };
  mockPaginationQueries();
  const view = await renderNative(<ThresholdsScreen />);
  await act(async () => {});

  await act(async () => {
    fireEvent.press(screen.getByTestId("threshold-history-load-earlier"));
  });
  expect(paginationState.requestedInputs.at(-1)).toEqual({
    historyCursor: cursor,
    historyLimit: 100,
  });

  paginationState.olderData = {
    publication: {
      computedAt: "2026-05-01T00:00:00Z",
      publishedRevision: 1,
      status: "available",
    },
    history: {
      items: [
        { ...historyPoint("current", 999), method: "obsolete" },
        { ...historyPoint("older", 225), effectiveAt: "2026-02-01T00:00:00.000Z" },
      ],
      nextCursor: secondCursor,
    },
  };
  await act(async () => {
    view.rerender(<ThresholdsScreen />);
  });

  await waitFor(() => expect(screen.getByText("225 W · Feb 1, 2026")).toBeTruthy());
  expect(screen.queryByText("999 W · May 1, 2026")).toBeNull();
  expect(screen.getByText("250 W · May 1, 2026")).toBeTruthy();
  paginationState.olderData = null;
  await act(async () => {
    fireEvent.press(screen.getByTestId("threshold-history-load-earlier"));
  });
  expect(paginationState.requestedInputs.at(-1)).toEqual({
    historyCursor: secondCursor,
    historyLimit: 100,
  });
});

it("retains loaded history after an older-page failure and retries the same cursor", async () => {
  const cursor = {
    createdAt: "2026-02-01T00:00:00.000Z",
    effectiveAt: "2026-02-01T00:00:00.000Z",
    thresholdId: "older-cursor",
  };
  paginationState.overviewData = {
    publication: { status: "available", publishedRevision: 1, computedAt: "2026-05-01T00:00:00Z" },
    current: {
      thresholds: {
        bike: { status: "unavailable" },
        run: { status: "unavailable" },
        swim: { status: "unavailable" },
      },
    },
    history: { items: [historyPoint("current", 250)], nextCursor: cursor },
  };
  mockPaginationQueries();
  const view = await renderNative(<ThresholdsScreen />);
  await act(async () => {});
  await act(async () => {
    fireEvent.press(screen.getByTestId("threshold-history-load-earlier"));
  });
  paginationState.olderIsError = true;
  await act(async () => {
    view.rerender(<ThresholdsScreen />);
  });

  expect(screen.getByText(/loaded history is unchanged/i)).toBeTruthy();
  expect(screen.getByText("250 W · May 1, 2026")).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Retry earlier threshold history"));
  });
  expect(paginationState.olderRefetch).toHaveBeenCalledTimes(1);
  expect(paginationState.requestedInputs.at(-1)).toEqual({
    historyCursor: cursor,
    historyLimit: 100,
  });

  paginationState.olderIsError = false;
  paginationState.olderData = {
    publication: {
      computedAt: "2026-05-01T00:00:00Z",
      publishedRevision: 1,
      status: "available",
    },
    history: {
      items: [{ ...historyPoint("older", 225), effectiveAt: "2026-02-01T00:00:00.000Z" }],
      nextCursor: null,
    },
  };
  await act(async () => {
    view.rerender(<ThresholdsScreen />);
  });
  await waitFor(() => expect(screen.getByText("225 W · Feb 1, 2026")).toBeTruthy());
});

it("clears old pages and ignores an in-flight response when the publication changes", async () => {
  const cursor = {
    createdAt: "2026-02-01T00:00:00.000Z",
    effectiveAt: "2026-02-01T00:00:00.000Z",
    thresholdId: "old-cursor",
  };
  paginationState.overviewData = {
    publication: { status: "available", publishedRevision: 1, computedAt: "2026-05-01T00:00:00Z" },
    current: {
      thresholds: {
        bike: { status: "unavailable" },
        run: { status: "unavailable" },
        swim: { status: "unavailable" },
      },
    },
    history: { items: [historyPoint("revision-one", 250)], nextCursor: cursor },
  };
  mockPaginationQueries();
  const view = await renderNative(<ThresholdsScreen />);
  await act(async () => {});
  await act(async () => {
    fireEvent.press(screen.getByTestId("threshold-history-load-earlier"));
  });

  paginationState.overviewData = {
    publication: { status: "available", publishedRevision: 2, computedAt: "2026-05-02T00:00:00Z" },
    current: {
      thresholds: {
        bike: { status: "unavailable" },
        run: { status: "unavailable" },
        swim: { status: "unavailable" },
      },
    },
    history: { items: [historyPoint("revision-two", 260)], nextCursor: null },
  };
  paginationState.olderData = {
    publication: {
      computedAt: "2026-05-01T00:00:00Z",
      publishedRevision: 1,
      status: "available",
    },
    history: { items: [historyPoint("stale-response", 150)], nextCursor: null },
  };
  await act(async () => {
    view.rerender(<ThresholdsScreen />);
  });

  await waitFor(() => expect(screen.getByText("260 W · May 1, 2026")).toBeTruthy());
  expect(screen.queryByText("250 W · May 1, 2026")).toBeNull();
  expect(screen.queryByText("150 W · May 1, 2026")).toBeNull();
});

it("rejects an older response when the server publication changes during the request", async () => {
  const cursor = {
    createdAt: "2026-02-01T00:00:00.000Z",
    effectiveAt: "2026-02-01T00:00:00.000Z",
    thresholdId: "cursor",
  };
  paginationState.overviewData = {
    publication: { computedAt: "2026-05-01T00:00:00Z", publishedRevision: 1, status: "available" },
    current: {
      thresholds: {
        bike: { status: "unavailable" },
        run: { status: "unavailable" },
        swim: { status: "unavailable" },
      },
    },
    history: { items: [historyPoint("current", 250)], nextCursor: cursor },
  };
  mockPaginationQueries();
  const view = await renderNative(<ThresholdsScreen />);
  await act(async () => {});
  await act(async () => {
    fireEvent.press(screen.getByTestId("threshold-history-load-earlier"));
  });
  paginationState.olderData = {
    publication: { computedAt: "2026-05-02T00:00:00Z", publishedRevision: 2, status: "available" },
    history: { items: [historyPoint("unexpected", 999)], nextCursor: null },
  };
  await act(async () => {
    view.rerender(<ThresholdsScreen />);
  });

  await waitFor(() => expect(paginationState.overviewRefetch).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("999 W · May 1, 2026")).toBeNull();
  expect(screen.getByTestId("threshold-history-load-earlier")).toBeTruthy();
});

it("rejects a cached old-publication response after a new first page reuses its cursor", async () => {
  const cursor = {
    createdAt: "2026-02-01T00:00:00.000Z",
    effectiveAt: "2026-02-01T00:00:00.000Z",
    thresholdId: "cursor",
  };
  paginationState.overviewData = {
    publication: { computedAt: "2026-05-01T00:00:00Z", publishedRevision: 1, status: "available" },
    current: {
      thresholds: {
        bike: { status: "unavailable" },
        run: { status: "unavailable" },
        swim: { status: "unavailable" },
      },
    },
    history: { items: [historyPoint("revision-one", 250)], nextCursor: cursor },
  };
  mockPaginationQueries();
  const view = await renderNative(<ThresholdsScreen />);
  await act(async () => {});
  paginationState.overviewData = {
    publication: { computedAt: "2026-05-02T00:00:00Z", publishedRevision: 2, status: "available" },
    current: {
      thresholds: {
        bike: { status: "unavailable" },
        run: { status: "unavailable" },
        swim: { status: "unavailable" },
      },
    },
    history: { items: [historyPoint("revision-two", 260)], nextCursor: cursor },
  };
  await act(async () => {
    view.rerender(<ThresholdsScreen />);
  });
  await waitFor(() => expect(screen.getByText("Publication available · revision 2")).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByTestId("threshold-history-load-earlier"));
  });
  paginationState.olderData = {
    publication: { computedAt: "2026-05-01T00:00:00Z", publishedRevision: 1, status: "available" },
    history: { items: [historyPoint("cached-old", 150)], nextCursor: null },
  };
  await act(async () => {
    view.rerender(<ThresholdsScreen />);
  });

  await waitFor(() => expect(paginationState.overviewRefetch).toHaveBeenCalledTimes(1));
  expect(screen.getByText("260 W · May 1, 2026")).toBeTruthy();
  expect(screen.queryByText("150 W · May 1, 2026")).toBeNull();
});

it("honors an accepted empty terminal older page instead of offering the original cursor again", async () => {
  const cursor = {
    createdAt: "2026-02-01T00:00:00.000Z",
    effectiveAt: "2026-02-01T00:00:00.000Z",
    thresholdId: "cursor",
  };
  paginationState.overviewData = {
    publication: { computedAt: "2026-05-01T00:00:00Z", publishedRevision: 1, status: "available" },
    current: {
      thresholds: {
        bike: { status: "unavailable" },
        run: { status: "unavailable" },
        swim: { status: "unavailable" },
      },
    },
    history: { items: [historyPoint("current", 250)], nextCursor: cursor },
  };
  mockPaginationQueries();
  const view = await renderNative(<ThresholdsScreen />);
  await act(async () => {});
  await act(async () => {
    fireEvent.press(screen.getByTestId("threshold-history-load-earlier"));
  });
  paginationState.olderData = {
    publication: { computedAt: "2026-05-01T00:00:00Z", publishedRevision: 1, status: "available" },
    history: { items: [], nextCursor: null },
  };
  await act(async () => {
    view.rerender(<ThresholdsScreen />);
  });

  await waitFor(() => expect(screen.queryByTestId("threshold-history-load-earlier")).toBeNull());
});
