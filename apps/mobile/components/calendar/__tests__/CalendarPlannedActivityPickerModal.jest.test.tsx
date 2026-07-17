import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

const activityPlansState = {
  items: [] as any[],
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
  ActivityPlanCard: ({ activityPlan, onPress, testID }: any) => {
    const React = require("react");

    return React.createElement(
      "Pressable",
      { onPress, testID },
      React.createElement("Text", null, activityPlan?.name),
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
          data: { pages: [{ items: activityPlansState.items }] },
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
    activityPlansState.items = [
      {
        id: "favorite-1",
        name: "Favorite Long Run",
        categories: ["run"],
        primary_category: "run",
        estimated_duration: 5400,
        estimated_tss: 90,
        description: "Steady aerobic long run.",
        likes_count: 3,
        has_liked: true,
        updated_at: "2026-03-10T00:00:00.000Z",
      },
      {
        id: "recent-1",
        name: "Recent Tempo",
        categories: ["run"],
        primary_category: "run",
        estimated_duration: 3600,
        estimated_tss: 78,
        updated_at: "2026-03-21T00:00:00.000Z",
      },
      {
        id: "recent-2",
        name: "Recent Bike Build",
        categories: ["bike"],
        primary_category: "bike",
        estimated_duration: 4200,
        estimated_tss: 82,
        updated_at: "2026-03-20T00:00:00.000Z",
      },
      {
        id: "recent-3",
        name: "Recent Swim",
        categories: ["swim"],
        primary_category: "swim",
        estimated_duration: 2400,
        estimated_tss: 45,
        updated_at: "2026-03-19T00:00:00.000Z",
      },
      {
        id: "recent-4",
        name: "Recent Strength",
        categories: ["strength"],
        primary_category: "strength",
        estimated_duration: 1800,
        estimated_tss: 30,
        updated_at: "2026-03-18T00:00:00.000Z",
      },
      {
        id: "suggested-1",
        name: "Threshold Builder",
        categories: ["run"],
        primary_category: "run",
        estimated_duration: 4500,
        estimated_tss: 95,
        description: "Sharp threshold progression.",
        updated_at: "2026-03-01T00:00:00.000Z",
      },
      {
        id: "suggested-2",
        name: "VO2 Session",
        categories: ["run"],
        primary_category: "run",
        estimated_duration: 3900,
        estimated_tss: 92,
        updated_at: "2026-02-28T00:00:00.000Z",
      },
      {
        id: "suggested-3",
        name: "Brick Builder",
        categories: ["bike"],
        primary_category: "bike",
        estimated_duration: 4800,
        estimated_tss: 88,
        updated_at: "2026-02-27T00:00:00.000Z",
      },
      {
        id: "suggested-4",
        name: "Progressive Climb",
        categories: ["bike"],
        primary_category: "bike",
        estimated_duration: 5100,
        estimated_tss: 84,
        updated_at: "2026-02-26T00:00:00.000Z",
      },
      {
        id: "all-1",
        name: "Easy Recovery Spin",
        categories: ["bike"],
        primary_category: "bike",
        estimated_duration: 2400,
        estimated_tss: 28,
        updated_at: "2026-02-20T00:00:00.000Z",
      },
    ];
    activityPlansState.isLoading = false;
    activityPlansState.error = null;
  });

  it("renders browse-oriented sections and category filters", () => {
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

  it("supports category filtering and search-driven results", () => {
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
