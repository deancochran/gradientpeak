import React, { act } from "react";
import { createButtonComponent, createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const pushMock = jest.fn();

const activityPlans: any[] = [];

const trainingPlans = [
  {
    id: "tp-1",
    name: "10K Builder",
    description: "Build toward a faster 10K.",
    durationWeeks: { recommended: 8 },
    sport: ["run"],
    experienceLevel: ["beginner"],
    sessions_per_week_target: 4,
  },
];

const routes = [
  {
    id: "route-1",
    name: "River Loop",
    activity_category: "outdoor_run",
    total_distance: 10200,
    total_ascent: 180,
    description: "Flat opening miles with a steady climb home.",
  },
];

const users: any[] = [];

jest.useFakeTimers();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../../../packages/ui/src/test/react-native"),
  FlatList: ({ ListHeaderComponent, ListFooterComponent, ...props }: any) =>
    React.createElement("View", props, ListHeaderComponent, ListFooterComponent),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: ({ children, onPress, ...props }: any) =>
    React.createElement("Pressable", { onPress, ...props }, children),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("@/components/shared", () => ({
  __esModule: true,
  AppHeader: ({ title }: any) => React.createElement("Text", null, `Header:${title}`),
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: ({ activityPlan, onPress }: any) =>
    React.createElement(
      "Pressable",
      { onPress, testID: `activity-plan-${activityPlan.id}` },
      React.createElement("Text", null, activityPlan.name),
    ),
}));

jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
  AvatarImage: createHost("AvatarImage"),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createButtonComponent(),
}));

jest.mock("@repo/ui/components/empty-state-card", () => ({
  __esModule: true,
  EmptyStateCard: ({ title, description, actionLabel, onAction }: any) =>
    React.createElement(
      "View",
      null,
      React.createElement("Text", null, title),
      React.createElement("Text", null, description),
      actionLabel
        ? React.createElement(
            "Pressable",
            { onPress: onAction },
            React.createElement("Text", null, actionLabel),
          )
        : null,
    ),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/input", () => ({
  __esModule: true,
  Input: ({ value, onChangeText, placeholder, ...props }: any) =>
    React.createElement("TextInput", { value, onChangeText, placeholder, ...props }),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: createHost("Activity"),
  Bike: createHost("Bike"),
  ChevronRight: createHost("ChevronRight"),
  Dumbbell: createHost("Dumbbell"),
  Footprints: createHost("Footprints"),
  MapPin: createHost("MapPin"),
  Search: createHost("Search"),
  Users: createHost("Users"),
  Waves: createHost("Waves"),
  X: createHost("X"),
}));

jest.mock("@/lib/constants/routes", () => ({
  __esModule: true,
  ROUTES: {
    PLAN: {
      TRAINING_PLAN: {
        DETAIL: (id: string) => `/training-plan-detail?id=${id}`,
      },
    },
  },
}));

jest.mock("@/lib/trpc", () => ({
  __esModule: true,
  trpc: {
    activityPlans: {
      list: {
        useInfiniteQuery: jest.fn(() => ({
          data: { pages: [{ items: activityPlans, nextCursor: undefined }] },
          isLoading: false,
          isRefetching: false,
          hasNextPage: false,
          fetchNextPage: jest.fn(),
          refetch: jest.fn(),
        })),
      },
    },
    trainingPlans: {
      listTemplates: {
        useQuery: jest.fn(() => ({
          data: trainingPlans,
          isLoading: false,
          isRefetching: false,
          refetch: jest.fn(),
        })),
      },
    },
    routes: {
      list: {
        useInfiniteQuery: jest.fn(() => ({
          data: { pages: [{ items: routes, nextCursor: undefined }] },
          isLoading: false,
          isRefetching: false,
          hasNextPage: false,
          fetchNextPage: jest.fn(),
          refetch: jest.fn(),
        })),
      },
    },
    social: {
      searchUsers: {
        useQuery: jest.fn(() => ({
          data: { users, total: users.length, hasMore: false },
          isLoading: false,
          isRefetching: false,
          refetch: jest.fn(),
        })),
      },
    },
  },
}));

const DiscoverScreen = require("../discover").default;

describe("discover screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  it("renders the guided browse state for activity plans", () => {
    renderNative(<DiscoverScreen />);

    expect(screen.getByText("Header:Discover")).toBeTruthy();
    expect(screen.getByText("Find your next workout")).toBeTruthy();
    expect(screen.getByText("Browse by type")).toBeTruthy();
    expect(screen.getByText("Discover your next session")).toBeTruthy();
    expect(screen.getByText("0 activity plans")).toBeTruthy();
  });

  it("filters activity plans by category chip", () => {
    renderNative(<DiscoverScreen />);

    fireEvent.press(screen.getByText("Cycling"));

    expect(screen.getByText("No activity plans found")).toBeTruthy();
    expect(screen.getByText("Clear filters")).toBeTruthy();
  });

  it("updates tab copy and search helper on the profiles tab", async () => {
    renderNative(<DiscoverScreen />);

    fireEvent.press(screen.getByText("Profiles"));

    expect(screen.getByText("Find people to follow")).toBeTruthy();
    expect(screen.getByText("No profiles found")).toBeTruthy();

    act(() => {
      fireEvent.changeText(screen.getByPlaceholderText("Search profiles"), "coach");
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText(/Searching profiles for/)).toBeTruthy();
    });
  });
});
