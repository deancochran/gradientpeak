import React from "react";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  FlatList: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent, ...props }: any) =>
    React.createElement(
      "FlatList",
      props,
      ListHeaderComponent,
      data?.length ? data.map((item: any) => renderItem({ item })) : ListEmptyComponent,
    ),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: createHost("StackScreen"),
  },
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));
jest.mock("@repo/ui/components/empty-state-card", () => ({
  __esModule: true,
  EmptyStateCard: createHost("EmptyStateCard"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: any) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: createHost("ActivityPlanCard"),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => pushMock,
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    activityPlans: {
      list: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "plan-1",
                name: "Tempo Ride",
                description: "Steady state tempo blocks",
                activity_category: "bike",
                template_visibility: "private",
                owner: {
                  id: "owner-1",
                  username: "Owner",
                  avatar_url: null,
                },
              },
            ],
          },
          isLoading: false,
          error: null,
        }),
      },
    },
  },
}));

const ActivityPlansListScreen = require("../activity-plans-list").default;

describe("activity plans list screen", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("opens activity plan detail when tapping a row", () => {
    renderNative(<ActivityPlansListScreen />);

    fireEvent.press(screen.getByTestId("activity-plan-list-item-plan-1"));

    expect(pushMock).toHaveBeenCalledWith("/activity-plan-detail?id=plan-1");
  });

  it("renders owner identity on each plan card", () => {
    const rendered = renderNative(<ActivityPlansListScreen />);

    expect((rendered as any).UNSAFE_getByType("ActivityPlanCard").props.activityPlan.owner).toEqual(
      expect.objectContaining({
        id: "owner-1",
        username: "Owner",
      }),
    );
  });
});
