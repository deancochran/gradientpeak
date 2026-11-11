import { usePreferredUnitSystem } from "@/lib/hooks/usePreferredUnitSystem";
import {
  createActivityPlanStructure,
  createActivityPlanSummary,
} from "../../../../test/activity-plan-projection-fixture";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";
import { ResourcePickerModal } from "../ResourcePickerModal";
import {
  mapActivityPlanToResourcePickerItem,
  mapRouteToResourcePickerItem,
  ResourcePickerResultRow,
} from "../ResourcePickerResultRow";

const refetchMock = jest.fn();
let pickerError: Error | null = null;
let pickerPlans: ReturnType<typeof createActivityPlanSummary>[] = [];
jest.mock("@/lib/api", () => ({
  api: {
    routes: { list: { useInfiniteQuery: () => ({ data: { pages: [] } }) } },
    activityPlans: {
      list: {
        useInfiniteQuery: () => ({
          data: { pages: [{ items: pickerPlans }] },
          error: pickerError,
          isLoading: false,
          isFetching: false,
          isFetchingNextPage: false,
          refetch: refetchMock,
        }),
      },
    },
  },
}));
jest.mock("@/components/shared/AppFormModal", () => ({ AppFormModal: createHost("AppFormModal") }));
jest.mock("@/components/shared/SearchField", () => ({ SearchField: createHost("TextInput") }));
jest.mock("@/lib/hooks/useDebouncedValue", () => ({ useDebouncedValue: (value: string) => value }));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: createHost("Pressable"),
  View: createHost("View"),
}));

jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: (props: Record<string, unknown>) =>
    jest.requireActual("react").createElement("ActivityPlanCard", {
      ...props,
      testID: "resource-picker-activity-plan-card",
    }),
}));
jest.mock("@/components/shared/RouteCard", () => ({
  __esModule: true,
  RouteCard: (props: Record<string, unknown>) =>
    jest.requireActual("react").createElement("RouteCard", {
      ...props,
      testID: "resource-picker-route-card",
    }),
}));
jest.mock("@/lib/activityPlanMetrics", () => ({
  __esModule: true,
  getActivityPlanQuantitySummary: jest.fn(() => ({
    commonLoad: null,
    distanceMeters: null,
    durationSeconds: null,
  })),
}));
jest.mock("@/lib/constants/activities", () => ({
  __esModule: true,
  getActivityCategoryConfig: jest.fn(() => ({
    bgColor: "bg-muted",
    color: "text-foreground",
    icon: "Icon",
    name: "Other",
  })),
}));
jest.mock("@/lib/estimatedMetrics", () => ({
  __esModule: true,
  formatEstimatedDurationSeconds: jest.fn(),
}));
jest.mock("@/lib/hooks/usePreferredUnitSystem", () => ({
  __esModule: true,
  usePreferredUnitSystem: jest.fn(() => "metric"),
}));

const mockUsePreferredUnitSystem = jest.mocked(usePreferredUnitSystem);

describe("ResourcePickerResultRow", () => {
  beforeEach(() => {
    mockUsePreferredUnitSystem.mockReturnValue("metric");
    pickerError = null;
    pickerPlans = [];
    refetchMock.mockReset();
  });

  it("shows an empty-result query error, retries with its search, and restores canonical selected semantics", async () => {
    pickerError = new Error("Offline");
    const onSelect = jest.fn();
    const props = {
      visible: true,
      scope: "activityPlans" as const,
      title: "Attach Activity Plan",
      selectedId: "plan-1",
      searchTestID: "picker-search",
      onClose: jest.fn(),
      onSelect,
    };
    const view = await renderNative(<ResourcePickerModal {...props} />);
    await fireEvent.changeText(screen.getByTestId("picker-search"), "Tempo");
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("No activity plans match that search.")).toBeNull();
    await fireEvent.press(screen.getByText("Try again"));
    expect(refetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("picker-search").props.value).toBe("Tempo");
    pickerError = null;
    pickerPlans = [createActivityPlanSummary({ id: "plan-1", name: "Tempo Builder" })];
    await view.rerender(<ResourcePickerModal {...props} />);
    const row = screen.getByTestId("resource-picker-select-activity-plan");
    expect(row.props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId("resource-picker-activity-plan-card").props.plan.id).toBe("plan-1");
    await fireEvent.press(row);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "plan-1", presentation: "canonical" }),
    );
  });

  it("renders an activity plan through the dense canonical card while preserving selection", async () => {
    const onPress = jest.fn();

    await renderNative(
      <ResourcePickerResultRow
        isSelected
        item={{
          activityPlan: createActivityPlanSummary({ id: "plan-1", name: "Tempo Builder" }),
          id: "plan-1",
          name: "Tempo Builder",
          presentation: "canonical",
        }}
        onPress={onPress}
        scope="activityPlans"
      />,
    );

    const activityPlanCard = screen.getByTestId("resource-picker-activity-plan-card");
    expect(activityPlanCard.props.variant).toBe("compact");
    expect(activityPlanCard.props.plan).toEqual(expect.objectContaining({ id: "plan-1" }));
    expect(screen.getByTestId("resource-picker-select-activity-plan-selected")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("resource-picker-select-activity-plan"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("renders and selects routes through a stable semantic result action", async () => {
    const onPress = jest.fn();
    await renderNative(
      <ResourcePickerResultRow
        isSelected={false}
        item={{
          id: "route-1",
          name: "River Loop",
          presentation: "canonical",
          routeCardData: { id: "route-1", name: "River Loop", total_distance: 5000 },
        }}
        onPress={onPress}
        scope="routes"
      />,
    );

    const routeCard = screen.getByTestId("resource-picker-route-card");
    expect(routeCard.props.variant).toBe("list");
    expect(routeCard.props.showAttribution).toBe(false);
    expect(routeCard.props.showLike).toBe(false);
    await fireEvent.press(screen.getByTestId("resource-picker-select-route"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("keeps explicit external items selectable and disabled with accessible minimum hit target parity", async () => {
    await renderNative(
      <ResourcePickerResultRow
        disabled
        isSelected={false}
        item={{ id: "legacy-route", name: "Imported route", presentation: "external" }}
        onPress={jest.fn()}
        scope="routes"
      />,
    );

    const result = screen.getByTestId("resource-picker-select-route");
    expect(result.props.disabled).toBe(true);
    expect(result.props.accessibilityLabel).toBe("Select, Imported route, Private or shared");
    expect(result.props.className).toContain("min-h-11");
    expect(screen.queryByTestId("resource-picker-route-card")).toBeNull();
  });

  it("formats external route metadata in the viewer's preferred units", async () => {
    mockUsePreferredUnitSystem.mockReturnValue("imperial");

    await renderNative(
      <ResourcePickerResultRow
        isSelected={false}
        item={{
          id: "legacy-route",
          name: "Imported route",
          presentation: "external",
          totalAscent: 100,
          totalDistance: 5000,
        }}
        onPress={jest.fn()}
        scope="routes"
      />,
    );

    expect(screen.getByText("Private or shared · 3.1 mi · 328.1 ft climb")).toBeTruthy();
    expect(screen.getByTestId("resource-picker-select-route").props.accessibilityLabel).toBe(
      "Select, Imported route, Private or shared, 3.1 mi, 328.1 ft climb",
    );
  });

  it("maps every current query result to its canonical card presentation", () => {
    const plan = createActivityPlanSummary({
      id: "plan-2",
      name: "Endurance",
      activityCategory: "bike",
      structure: createActivityPlanStructure("bike"),
    });
    expect(mapActivityPlanToResourcePickerItem(plan)).toMatchObject({
      activityPlan: {
        activityCategory: "bike",
        id: "plan-2",
        name: "Endurance",
        structure: expect.objectContaining({ activity_category: "bike" }),
      },
      presentation: "canonical",
    });
    expect(mapRouteToResourcePickerItem({ id: "route-2", name: "Park Loop" })).toMatchObject({
      routeCardData: { id: "route-2", name: "Park Loop" },
      presentation: "canonical",
    });
  });
});
