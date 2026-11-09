import { fireEvent } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

const navigate = jest.fn();
const useQuery = jest.fn();

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

it("renders threshold progression metadata and opens source activities", async () => {
  useQuery.mockReturnValue({
    data: {
      publication: { status: "available", publishedRevision: 4 },
      current: {
        thresholds: {
          bike: {
            status: "available",
            value: 250,
            freshness: "fresh",
            effectiveAt: "2026-04-10T00:00:00.000Z",
            method: "bike_power_30m",
            confidence: 0.8,
          },
          run: {
            status: "available",
            value: 4,
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
    screen.container.queryAll((node) => node.props.testID === "threshold-history-chart")[0],
  ).toBeTruthy();
  expect(
    screen.getByText("bike power 30m · 75% confidence · policy threshold-policy-v1"),
  ).toBeTruthy();
  await fireEvent.press(screen.getByTestId("threshold-source-activity-activity-1"));
  expect(navigate).toHaveBeenCalledWith("/activity-detail?id=activity-1");
});
