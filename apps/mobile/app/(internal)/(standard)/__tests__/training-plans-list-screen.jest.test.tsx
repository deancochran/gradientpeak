import { act } from "@testing-library/react-native";
import React from "react";
import { ROUTES } from "@/lib/constants/routes";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
jest.mock("@/components/shared/AppBottomSheet", () => ({
  APP_BOTTOM_SHEET_PRESENTATIONS: { filter: { initialSnapIndex: 0, snapPoints: ["80%"] } },
  AppBottomSheet: (props: {
    visible: boolean;
    children: React.ReactNode;
    footer: React.ReactNode;
  }) => (props.visible ? React.createElement("View", null, props.children, props.footer) : null),
}));
const queryInputMock = jest.fn();
const refetchMock = jest.fn(async () => undefined);
const nextPageMock = jest.fn<Promise<unknown>, []>();
let queryError: Error | null = null;
let empty = false;
let hasNextPage = false;
let extraPage = false;
const plansState = [
  {
    id: "plan-1",
    name: "Marathon Build",
    description: "16-week progression",
    content_visibility: "private",
    activity_category: ["run"],
    sessions_per_week_target: 5,
    durationWeeks: { recommended: 16 },
    structure: {
      target_weekly_load_min: 420,
      target_weekly_load_max: 520,
      min_rest_days_per_week: 2,
      periodization_template: {
        target_date: "2026-09-21",
      },
    },
  },
];

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: createHost("StackScreen"),
  },
}));

jest.mock("@gorhom/bottom-sheet", () => ({
  __esModule: true,
  default: createHost("BottomSheet"),
  BottomSheetModal: createHost("BottomSheetModal"),
  BottomSheetBackdrop: createHost("BottomSheetBackdrop"),
  BottomSheetFooter: createHost("BottomSheetFooter"),
  BottomSheetScrollView: createHost("BottomSheetScrollView"),
  BottomSheetView: createHost("BottomSheetView"),
}));

jest.mock("@/lib/stores/theme-store", () => ({
  __esModule: true,
  useTheme: () => ({ resolvedTheme: "light" }),
}));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: React.PropsWithChildren) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

jest.mock("@repo/ui/components/loading-skeletons", () => ({
  __esModule: true,
  ListSkeleton: createHost("ListSkeleton"),
}));

jest.mock("@repo/ui/components/empty-state-card", () => ({
  __esModule: true,
  EmptyStateCard: createHost("EmptyStateCard"),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => pushMock,
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    trainingPlans: {
      list: {
        useInfiniteQuery: (input: unknown) => {
          queryInputMock(input);
          return {
            data: {
              pages: [
                {
                  items: empty ? [] : plansState,
                  total: plansState.length,
                  nextCursor: hasNextPage ? "next" : undefined,
                },
                ...(extraPage
                  ? [
                      {
                        items: [{ ...plansState[0], id: "plan-2", name: "Next page plan" }],
                        total: 2,
                        nextCursor: undefined,
                      },
                    ]
                  : []),
              ],
            },
            error: queryError,
            isError: Boolean(queryError),
            isFetching: false,
            isLoading: false,
            isFetchingNextPage: false,
            hasNextPage,
            fetchNextPage: nextPageMock,
            refetch: refetchMock,
          };
        },
      },
    },
  },
}));

jest.mock("@/components/shared/TrainingPlanCard", () => ({
  __esModule: true,
  TrainingPlanCard: ({
    plan,
    onPress,
    variant,
  }: {
    plan: { id: string; name: string };
    onPress?: () => void;
    variant?: string;
  }) =>
    React.createElement(
      "TrainingPlanCard",
      { onPress, testID: `mock-training-plan-card-${plan.id}`, variant },
      React.createElement("Text", null, plan.name),
    ),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ChevronRight: createHost("ChevronRight"),
}));

const TrainingPlansListScreenWithBoundary = require("../training-plans-list").default;

describe("training plans list screen", () => {
  beforeEach(() => {
    pushMock.mockReset();
    queryInputMock.mockReset();
    refetchMock.mockClear();
    nextPageMock.mockReset();
    queryError = null;
    empty = false;
    hasNextPage = false;
    extraPage = false;
  });

  it("keeps the search and visibility filter across an initial query failure and retry", async () => {
    queryError = new Error("Offline");
    empty = true;
    await renderNative(<TrainingPlansListScreenWithBoundary />);
    await fireEvent.changeText(screen.getByTestId("training-plans-list-search-input"), "marathon");
    await fireEvent.press(screen.getByTestId("training-plans-list-filter-button"));
    await fireEvent.press(screen.getByTestId("training-plans-list-filter-visibility-private"));
    await fireEvent.press(screen.getByTestId("training-plans-list-filter-sheet-apply"));
    // The FlatList test host omits empty slots. Exercise the actual error slot
    // returned by ResourceList, including its retry callback.
    await renderNative(screen.getByTestId("training-plans-list-content").props.ListEmptyComponent);
    expect(screen.getByText("Unable to load training plans")).toBeTruthy();
    expect(screen.queryByText("No training plans yet")).toBeNull();
    await fireEvent.press(screen.getByText("Try again"));
    expect(refetchMock).toHaveBeenCalledTimes(1);
    expect(queryInputMock).toHaveBeenLastCalledWith({
      ownerScope: "own",
      search: "marathon",
      visibility: "private",
      limit: 25,
    });
  });

  it("guards repeated end-reached events and renders the next page", async () => {
    hasNextPage = true;
    let resolve!: () => void;
    nextPageMock.mockReturnValue(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    const view = await renderNative(<TrainingPlansListScreenWithBoundary />);
    const load = screen.getByTestId("training-plans-list-content").props.onEndReached;
    await act(async () => {
      load();
      load();
    });
    expect(nextPageMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Marathon Build")).toBeTruthy();
    await act(async () => resolve());
    extraPage = true;
    await view.rerender(<TrainingPlansListScreenWithBoundary />);
    expect(screen.getByText("Next page plan")).toBeTruthy();
  });

  it("navigates to the selected plan detail route", async () => {
    await renderNative(<TrainingPlansListScreenWithBoundary />);

    await fireEvent.press(screen.getByText("Marathon Build"));
    expect(pushMock).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PLAN.DETAIL("plan-1"));
  });

  it("renders the plan summary before rows", async () => {
    await renderNative(<TrainingPlansListScreenWithBoundary />);

    expect(screen.getByTestId("training-plans-list-summary")).toBeTruthy();
    expect(screen.getByText("1 plan")).toBeTruthy();
  });

  it("renders each training plan with the rich default card", async () => {
    await renderNative(<TrainingPlansListScreenWithBoundary />);

    expect(screen.getByTestId("mock-training-plan-card-plan-1").props.variant).toBeUndefined();
  });
});
