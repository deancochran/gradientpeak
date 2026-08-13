import { createActivityPlanSummary } from "../../../test/activity-plan-projection-fixture";
import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

type ActivityPlanFixture = {
  id: string;
  name: string;
  activity_category: string;
  estimated_duration: number;
  description?: string;
  likes_count?: number;
  has_liked?: boolean;
  updated_at: string;
};

const activityPlansState = {
  items: [] as ReturnType<typeof createActivityPlanSummary>[],
  isLoading: false,
  error: null as Error | null,
};

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ navigate: jest.fn(), push: jest.fn() }),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/input", () => ({
  __esModule: true,
  Input: createHost("Input"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ChevronRight: createHost("ChevronRight"),
  Clock3: createHost("Clock3"),
  Heart: createHost("Heart"),
  Search: createHost("Search"),
  Sparkles: createHost("Sparkles"),
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: ({
    plan,
    onPress,
    testID,
  }: {
    plan: ActivityPlanFixture;
    onPress?: () => void;
    testID?: string;
  }) => {
    const React = require("react");

    return React.createElement(
      "Pressable",
      { onPress, testID },
      React.createElement("Text", null, plan?.name),
    );
  },
}));

jest.mock("@/components/shared/SearchField", () => ({
  __esModule: true,
  SearchField: createHost("SearchField"),
}));

const { CalendarPlannedActivityPickerModal } = require("../CalendarPlannedActivityPickerModal");

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    activityPlans: {
      list: {
        useInfiniteQuery: () => ({
          data: {
            pages: [
              {
                items: activityPlansState.items,
              },
            ],
          },
          error: activityPlansState.error,
          fetchNextPage: jest.fn(),
          hasNextPage: false,
          isFetching: false,
          isFetchingNextPage: false,
          isLoading: activityPlansState.isLoading,
          refetch: jest.fn(),
        }),
      },
    },
    routes: {
      list: {
        useInfiniteQuery: () => ({
          data: { pages: [] },
          error: null,
          fetchNextPage: jest.fn(),
          hasNextPage: false,
          isFetching: false,
          isFetchingNextPage: false,
          isLoading: false,
          refetch: jest.fn(),
        }),
      },
    },
  },
}));

describe("CalendarPlannedActivityPickerModal", () => {
  beforeEach(() => {
    const plans: ActivityPlanFixture[] = [
      {
        id: "favorite-1",
        name: "Favorite Long Run",
        activity_category: "run",
        estimated_duration: 5400,
        description: "Steady aerobic long run.",
        likes_count: 3,
        has_liked: true,
        updated_at: "2026-03-10T00:00:00.000Z",
      },
      {
        id: "recent-1",
        name: "Recent Tempo",
        activity_category: "run",
        estimated_duration: 3600,
        updated_at: "2026-03-21T00:00:00.000Z",
      },
      {
        id: "recent-2",
        name: "Recent Bike Build",
        activity_category: "bike",
        estimated_duration: 4200,
        updated_at: "2026-03-20T00:00:00.000Z",
      },
      {
        id: "recent-3",
        name: "Recent Swim",
        activity_category: "swim",
        estimated_duration: 2400,
        updated_at: "2026-03-19T00:00:00.000Z",
      },
      {
        id: "recent-4",
        name: "Recent Strength",
        activity_category: "strength",
        estimated_duration: 1800,
        updated_at: "2026-03-18T00:00:00.000Z",
      },
      {
        id: "suggested-1",
        name: "Threshold Builder",
        activity_category: "run",
        estimated_duration: 4500,
        description: "Sharp threshold progression.",
        updated_at: "2026-03-01T00:00:00.000Z",
      },
      {
        id: "suggested-2",
        name: "VO2 Session",
        activity_category: "run",
        estimated_duration: 3900,
        updated_at: "2026-02-28T00:00:00.000Z",
      },
      {
        id: "suggested-3",
        name: "Brick Builder",
        activity_category: "bike",
        estimated_duration: 4800,
        updated_at: "2026-02-27T00:00:00.000Z",
      },
      {
        id: "suggested-4",
        name: "Progressive Climb",
        activity_category: "bike",
        estimated_duration: 5100,
        updated_at: "2026-02-26T00:00:00.000Z",
      },
      {
        id: "all-1",
        name: "Easy Recovery Spin",
        activity_category: "bike",
        estimated_duration: 2400,
        updated_at: "2026-02-20T00:00:00.000Z",
      },
    ];
    activityPlansState.items = plans.map(
      ({ activity_category, estimated_duration, has_liked, likes_count, updated_at, ...plan }) =>
        createActivityPlanSummary({
          ...plan,
          activityCategory: activity_category as "run" | "bike" | "swim" | "strength",
          engagement: { likes: likes_count ?? 0, viewerHasLiked: has_liked ?? false },
          metrics: [
            {
              key: "elapsed_duration",
              label: "Duration",
              value: estimated_duration,
              unit: "seconds",
              status: "available",
              reason: null,
            },
          ],
          updatedAt: updated_at,
        }),
    );
    activityPlansState.isLoading = false;
    activityPlansState.error = null;
  });

  it("renders browse-oriented sections and activity_category filters", () => {
    renderNative(
      <CalendarPlannedActivityPickerModal
        visible
        selectedDate="2026-03-21"
        onClose={jest.fn()}
        onSelectPlan={jest.fn()}
      />,
    );

    expect(screen.getByTestId("calendar-planned-activity-section-suggested")).toBeTruthy();
    expect(screen.getByTestId("calendar-planned-activity-section-recent")).toBeTruthy();
    expect(screen.getByTestId("calendar-planned-activity-section-favorites")).toBeTruthy();
    expect(screen.getByTestId("calendar-planned-activity-filter-all")).toBeTruthy();
    expect(screen.getByTestId("calendar-planned-activity-filter-run")).toBeTruthy();
  });

  it("supports activity_category filtering and search-driven results", () => {
    renderNative(
      <CalendarPlannedActivityPickerModal
        visible
        selectedDate="2026-03-21"
        onClose={jest.fn()}
        onSelectPlan={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId("calendar-planned-activity-filter-run"));

    expect(screen.getByText("Threshold Builder")).toBeTruthy();
    expect(screen.queryByText("Easy Recovery Spin")).toBeNull();

    fireEvent.press(screen.getByTestId("calendar-planned-activity-filter-all"));
    fireEvent.changeText(screen.getByTestId("calendar-planned-activity-search"), "Brick");

    expect(screen.getByTestId("calendar-planned-activity-section-search-results")).toBeTruthy();
    expect(screen.getByText("Brick Builder")).toBeTruthy();
    expect(screen.queryByText("Threshold Builder")).toBeNull();
  });

  it("selects a plan through the canonical picker result", () => {
    const onSelectPlan = jest.fn();
    renderNative(
      <CalendarPlannedActivityPickerModal
        visible
        selectedDate="2026-03-21"
        onClose={jest.fn()}
        onSelectPlan={onSelectPlan}
      />,
    );

    fireEvent.press(screen.getByTestId("calendar-planned-activity-option-favorite-1"));

    expect(onSelectPlan).toHaveBeenCalledWith("favorite-1");
  });

  it("keeps loading, error, and empty states in the canonical picker", () => {
    activityPlansState.items = [];
    activityPlansState.isLoading = true;
    const { rerender } = renderNative(
      <CalendarPlannedActivityPickerModal
        visible
        selectedDate="2026-03-21"
        onClose={jest.fn()}
        onSelectPlan={jest.fn()}
      />,
    );

    expect(screen.getByText("Loading...")).toBeTruthy();

    activityPlansState.isLoading = false;
    activityPlansState.error = new Error("Unavailable");
    rerender(
      <CalendarPlannedActivityPickerModal
        visible
        selectedDate="2026-03-21"
        onClose={jest.fn()}
        onSelectPlan={jest.fn()}
      />,
    );
    expect(screen.getByText("Could not load resources.")).toBeTruthy();

    activityPlansState.error = null;
    rerender(
      <CalendarPlannedActivityPickerModal
        visible
        selectedDate="2026-03-21"
        onClose={jest.fn()}
        onSelectPlan={jest.fn()}
      />,
    );
    expect(screen.getByText("No visible activity plans found.")).toBeTruthy();
  });
});
