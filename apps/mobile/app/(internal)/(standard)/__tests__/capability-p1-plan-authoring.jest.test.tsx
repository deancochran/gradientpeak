import React from "react";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const navigateMock = jest.fn();
const resetMock = jest.fn();
const paramsRef = { planId: undefined as string | undefined };

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => paramsRef,
  Stack: { Screen: createHost("StackScreen") },
}));
jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateMock,
}));
jest.mock("@/lib/stores/activityPlanCreation", () => ({
  __esModule: true,
  useActivityPlanCreationStore: <T,>(selector: (state: { reset: () => void }) => T) =>
    selector({ reset: resetMock }),
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    activityPlans: {
      list: {
        useQuery: () => ({
          data: { items: [{ id: "plan-1", name: "Tempo Ride" }] },
          isLoading: false,
          error: null,
        }),
      },
    },
  },
}));
jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: { children?: React.ReactNode }) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));
jest.mock("@/components/shared/HeaderAction", () => ({
  __esModule: true,
  HeaderTextAction: ({
    accessibilityLabel,
    label,
  }: {
    accessibilityLabel: string;
    label: string;
  }) => (
    <button type="button" aria-label={accessibilityLabel}>
      {label}
    </button>
  ),
}));
jest.mock("@/components/shared/IndexSearchBar", () => ({
  __esModule: true,
  FilterChip: createHost("FilterChip"),
  FilterSection: createHost("FilterSection"),
  IndexResultsSummary: createHost("IndexResultsSummary"),
  IndexSearchBar: createHost("IndexSearchBar"),
}));
jest.mock("@/components/shared/ResourceList", () => ({
  __esModule: true,
  ResourceList: ({
    data,
    renderItem,
  }: {
    data: Array<{ id: string }>;
    renderItem: (item: { id: string }) => React.ReactNode;
  }) => (
    <>
      {data.map((item) => (
        <React.Fragment key={item.id}>{renderItem(item)}</React.Fragment>
      ))}
    </>
  ),
}));
jest.mock("@gorhom/bottom-sheet", () => ({
  __esModule: true,
  default: createHost("BottomSheet"),
  BottomSheetBackdrop: createHost("BottomSheetBackdrop"),
  BottomSheetScrollView: createHost("BottomSheetScrollView"),
  BottomSheetView: createHost("BottomSheetView"),
}));
jest.mock("@/components/shared/IndexFilterSheet", () => ({
  __esModule: true,
  IndexFilterSheet: createHost("IndexFilterSheet"),
}));
jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: ({
    plan,
    onPress,
    testID,
  }: {
    plan: { name: string };
    onPress: () => void;
    testID: string;
  }) => (
    <button type="button" testID={testID} onPress={onPress}>
      {plan.name}
    </button>
  ),
}));
jest.mock("@/components/activity-plan/ActivityPlanComposerScreen", () => ({
  __esModule: true,
  ActivityPlanComposerScreen: (props: { mode?: string; planId?: string }) =>
    React.createElement("ActivityPlanComposerScreen", {
      testID: "activity-plan-composer",
      ...props,
    }),
}));

describe("activity-plan authoring mobile boundary", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    resetMock.mockReset();
    paramsRef.planId = undefined;
  });

  it("browses a plan and opens its inspection route", async () => {
    const ActivityPlansListScreen = (await import("../activity-plans-list")).default;
    renderNative(<ActivityPlansListScreen />);
    fireEvent.press(screen.getByTestId("activity-plan-list-item-plan-1"));
    expect(navigateMock).toHaveBeenCalledWith("/activity-plan-detail?id=plan-1");
  });

  it("uses create mode for new plans and edit mode for an owned plan", async () => {
    const CreateActivityPlanRoute = (await import("../create-activity-plan")).default;
    renderNative(<CreateActivityPlanRoute />);
    expect(screen.getByTestId("activity-plan-composer").props).toMatchObject({ mode: "create" });
    expect(resetMock).toHaveBeenCalledTimes(1);

    paramsRef.planId = "plan-1";
    renderNative(<CreateActivityPlanRoute />);
    expect(screen.getByTestId("activity-plan-composer").props).toMatchObject({
      mode: "edit",
      planId: "plan-1",
    });
  });
});
