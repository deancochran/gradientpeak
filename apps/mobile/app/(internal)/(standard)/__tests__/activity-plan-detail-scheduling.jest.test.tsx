import { act, waitFor } from "@testing-library/react-native";
import React from "react";
import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

var alertMock = jest.fn();
var duplicateMutateMock = jest.fn();
type ActivityPlanMock = {
  id?: string;
  name?: string;
  [key: string]: unknown;
};

type PlannedActivityMock = {
  id?: string;
  [key: string]: unknown;
};

type HostProps = {
  children?: React.ReactNode;
  options?: { headerRight?: () => React.ReactNode };
  [key: string]: unknown;
};

type DuplicateMutationOptions = {
  onSuccess?: (result: { id: string }) => void;
};

type TestNode = {
  props?: { children?: React.ReactNode };
};

type UnsafeTypeQuery = {
  UNSAFE_getAllByType: (type: string) => TestNode[];
};

var fetchedPlanMock = {
  current: null as ActivityPlanMock | null,
};
var plannedActivityMock = {
  current: null as PlannedActivityMock | null,
};
var localSearchParamsMock = {} as Record<string, string | undefined>;
var routerMock = {
  back: jest.fn(),
  navigate: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
};

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: (props: HostProps) =>
      React.createElement(
        "StackScreen",
        props,
        typeof props.options?.headerRight === "function" ? props.options.headerRight() : null,
      ),
  },
  useRouter: () => routerMock,
  useLocalSearchParams: () => localSearchParamsMock,
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: alertMock },
}));

jest.mock("react-native-maps", () => ({
  __esModule: true,
  default: createHost("MapView"),
  Polyline: createHost("Polyline"),
  PROVIDER_DEFAULT: "default",
}));

jest.mock("@/components/activity-plan/workout/TimelineChart", () => ({
  __esModule: true,
  TimelineChart: createHost("TimelineChart"),
}));

jest.mock("@/components/activity/charts/ElevationProfileChart", () => ({
  __esModule: true,
  ElevationProfileChart: createHost("ElevationProfileChart"),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createHost("Button"),
}));

jest.mock("@repo/ui/components/dropdown-menu", () => ({
  __esModule: true,
  DropdownMenu: createHost("DropdownMenu"),
  DropdownMenuContent: createHost("DropdownMenuContent"),
  DropdownMenuItem: createHost("DropdownMenuItem"),
  DropdownMenuTrigger: createHost("DropdownMenuTrigger"),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/switch", () => ({
  __esModule: true,
  Switch: createHost("Switch"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@repo/ui/components/textarea", () => ({
  __esModule: true,
  Textarea: createHost("Textarea"),
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({ profile: { id: "profile-1" } }),
}));

jest.mock("@/lib/hooks/useDeletedDetailRedirect", () => ({
  __esModule: true,
  useDeletedDetailRedirect: () => ({
    beginRedirect: jest.fn(),
    isRedirecting: false,
    redirectOnNotFound: jest.fn(),
  }),
}));

jest.mock("@/lib/stores/activitySelectionStore", () => ({
  __esModule: true,
  activitySelectionStore: { setSelection: jest.fn() },
}));

jest.mock("@/lib/scheduling/refreshScheduleViews", () => ({
  __esModule: true,
  refreshScheduleViews: jest.fn(async () => undefined),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => routerMock.push,
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      activityPlans: {
        list: { invalidate: jest.fn() },
        getUserPlansCount: { invalidate: jest.fn() },
        getById: { invalidate: jest.fn() },
      },
      events: {
        invalidate: jest.fn(),
        list: { invalidate: jest.fn() },
        getToday: { invalidate: jest.fn() },
      },
      trainingPlans: { invalidate: jest.fn() },
    }),
    activityPlans: {
      getById: {
        useQuery: () => ({ data: fetchedPlanMock.current, isLoading: false }),
      },
      duplicate: {
        useMutation: (options: DuplicateMutationOptions) => ({
          mutate: (input: unknown) => {
            duplicateMutateMock(input);
            options?.onSuccess?.({ id: "duplicated-plan-1" });
          },
          isPending: false,
        }),
      },
      delete: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false }),
      },
      update: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false }),
      },
    },
    events: {
      getById: {
        useQuery: () => ({ data: plannedActivityMock.current, error: null, isLoading: false }),
      },
      delete: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false }),
      },
    },
    routes: {
      get: {
        useQuery: () => ({ data: null }),
      },
      loadFull: {
        useQuery: () => ({ data: null }),
      },
    },
    social: {
      toggleLike: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false }),
      },
      getComments: {
        useInfiniteQuery: () => ({
          data: { pages: [{ comments: [], total: 0, hasMore: false, nextCursor: undefined }] },
          refetch: jest.fn(),
          hasNextPage: false,
          isFetchingNextPage: false,
          fetchNextPage: jest.fn(),
        }),
      },
      addComment: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false }),
      },
    },
  },
}));

jest.mock("@/lib/utils/durationConversion", () => ({
  __esModule: true,
  getDurationMs: () => 0,
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  buildEstimationContext: () => ({}),
  decodePolyline: () => null,
  estimateActivity: () => null,
  formatDurationSec: (seconds: number) => `${seconds}s`,
  getStepIntensityColor: () => "#000000",
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Calendar: "Calendar",
  CalendarCheck: "CalendarCheck",
  CalendarX: "CalendarX",
  Copy: "Copy",
  Edit: "Edit",
  Eye: "Eye",
  EyeOff: "EyeOff",
  Heart: "Heart",
  Library: "Library",
  MessageCircle: "MessageCircle",
  Send: "Send",
  Share2: "Share2",
  Smartphone: "Smartphone",
  Trash2: "Trash2",
}));

const ActivityPlanDetail = require("../activity-plan-detail").default;
const nativeAlertMock = require("react-native").Alert.alert as jest.Mock;

const getTextContent = (children: React.ReactNode): string => {
  if (typeof children === "string") {
    return children;
  }
  if (typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map((child) => getTextContent(child)).join("");
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(children)) {
    return getTextContent(children.props.children);
  }
  return "";
};

const getAllByTypeOrEmpty = (type: string) => {
  try {
    return (screen as unknown as UnsafeTypeQuery).UNSAFE_getAllByType(type);
  } catch {
    return [];
  }
};

const _findButton = (matcher: (label: string) => boolean) =>
  getAllByTypeOrEmpty("Button").find((node) => matcher(getTextContent(node.props?.children)));

const resetTestState = () => {
  fetchedPlanMock.current = null;
  plannedActivityMock.current = null;
  alertMock.mockReset();
  nativeAlertMock.mockReset();
  duplicateMutateMock.mockReset();
  routerMock.back.mockReset();
  routerMock.navigate.mockReset();
  routerMock.push.mockReset();
  routerMock.replace.mockReset();
  Object.keys(localSearchParamsMock).forEach((key) => {
    delete localSearchParamsMock[key];
  });
};

describe("activity plan detail scheduling", () => {
  beforeEach(() => {
    resetTestState();
  });

  it("opens event creation for a schedulable template plan", () => {
    localSearchParamsMock.template = JSON.stringify({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Tempo Builder",
      activity_category: "run",
      profile_id: "profile-1",
      structure: { intervals: [] },
    });

    renderNative(<ActivityPlanDetail />);

    act(() => {
      screen.getByTestId("activity-plan-options-schedule").props.onPress();
    });

    expect(nativeAlertMock).not.toHaveBeenCalled();
    expect(routerMock.navigate).toHaveBeenCalledWith({
      pathname: "/event-detail",
      params: {
        activityPlanId: "11111111-1111-1111-1111-111111111111",
        mode: "create",
      },
    });
  });

  it("shows a visible alert instead of silently doing nothing for an unsaved template", () => {
    localSearchParamsMock.template = JSON.stringify({
      name: "Draft Template",
      activity_category: "run",
      profile_id: "profile-1",
      structure: { intervals: [] },
    });

    renderNative(<ActivityPlanDetail />);

    act(() => {
      screen.getByTestId("activity-plan-options-schedule").props.onPress();
    });

    expect(nativeAlertMock).toHaveBeenCalledWith(
      "Scheduling unavailable",
      "Create this activity plan first, then schedule it from its detail screen.",
    );
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });

  it("opens event creation directly for a shared public template", async () => {
    localSearchParamsMock.template = JSON.stringify({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Shared Builder",
      activity_category: "run",
      profile_id: "another-profile",
      structure: { intervals: [] },
    });

    renderNative(<ActivityPlanDetail />);

    act(() => {
      screen.getByTestId("activity-plan-options-schedule").props.onPress();
    });

    expect(nativeAlertMock).not.toHaveBeenCalled();
    expect(duplicateMutateMock).not.toHaveBeenCalled();
    expect(routerMock.navigate).toHaveBeenCalledWith({
      pathname: "/event-detail",
      params: {
        activityPlanId: "11111111-1111-1111-1111-111111111111",
        mode: "create",
      },
    });
  });

  it("duplicates a shared activity plan into the owned detail flow", async () => {
    localSearchParamsMock.template = JSON.stringify({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Tempo Builder",
      activity_category: "run",
      profile_id: "template-owner",
      structure: { intervals: [] },
    });

    renderNative(<ActivityPlanDetail />);

    await act(async () => {
      screen.getByTestId("activity-plan-options-duplicate").props.onPress();
      await Promise.resolve();
    });

    expect(duplicateMutateMock).toHaveBeenCalledWith({
      id: "11111111-1111-1111-1111-111111111111",
      newName: "Tempo Builder (Copy)",
    });
    await waitFor(() => {
      expect(nativeAlertMock).toHaveBeenCalledWith(
        "Duplicated",
        "Activity plan added to your plans.",
        expect.any(Array),
      );
    });
    const duplicateAlertButtons = nativeAlertMock.mock.calls.at(-1)?.[2] as
      | Array<{ onPress?: () => void }>
      | undefined;
    act(() => {
      duplicateAlertButtons?.[0]?.onPress?.();
    });
    await waitFor(() => {
      expect(routerMock.replace).toHaveBeenCalledWith({
        pathname: "/activity-plan-detail",
        params: { planId: "duplicated-plan-1" },
      });
    });
  });

  it("opens event creation immediately for a routed owned plan", async () => {
    fetchedPlanMock.current = {
      id: "owned-plan-1",
      name: "Owned Builder",
      activity_category: "run",
      profile_id: "profile-1",
      structure: { intervals: [] },
    };
    localSearchParamsMock.planId = "owned-plan-1";
    localSearchParamsMock.action = "schedule";

    renderNative(<ActivityPlanDetail />);

    await waitFor(() => {
      expect(routerMock.navigate).toHaveBeenCalledWith({
        pathname: "/event-detail",
        params: {
          activityPlanId: "owned-plan-1",
          mode: "create",
        },
      });
    });
    expect(nativeAlertMock).not.toHaveBeenCalled();
  });

  it("opens event editing immediately for a routed scheduled activity", async () => {
    fetchedPlanMock.current = {
      id: "owned-plan-1",
      name: "Owned Builder",
      activity_category: "run",
      profile_id: "profile-1",
      structure: { intervals: [] },
    };
    localSearchParamsMock.planId = "owned-plan-1";
    localSearchParamsMock.eventId = "event-1";
    localSearchParamsMock.action = "schedule";
    plannedActivityMock.current = { id: "event-1", scheduled_date: "2026-05-21" };

    renderNative(<ActivityPlanDetail />);

    await waitFor(() => {
      expect(routerMock.navigate).toHaveBeenCalledWith("/event-detail-update?id=event-1");
    });
    expect(nativeAlertMock).not.toHaveBeenCalled();
  });

  it("navigates to event creation when scheduling a fetched plan", () => {
    fetchedPlanMock.current = {
      id: "owned-plan-1",
      name: "Owned Builder",
      activity_category: "run",
      profile_id: "profile-1",
      structure: { intervals: [] },
    };

    renderNative(<ActivityPlanDetail />);

    act(() => {
      screen.getByTestId("activity-plan-options-schedule").props.onPress();
    });

    expect(routerMock.navigate).toHaveBeenCalledWith({
      pathname: "/event-detail",
      params: {
        activityPlanId: "owned-plan-1",
        mode: "create",
      },
    });
  });

  it("hides schedule actions when the plan is opened from an event", () => {
    fetchedPlanMock.current = {
      id: "owned-plan-1",
      name: "Owned Builder",
      activity_category: "run",
      profile_id: "profile-1",
      structure: { intervals: [] },
    };
    localSearchParamsMock.planId = "owned-plan-1";
    localSearchParamsMock.eventId = "event-1";

    renderNative(<ActivityPlanDetail />);

    expect(screen.queryByTestId("activity-plan-options-schedule")).toBeNull();
    expect(screen.queryByTestId("activity-plan-options-open-event")).toBeNull();
    expect(screen.queryByTestId("activity-plan-options-remove-schedule")).toBeNull();
  });

  it("shows the new summary-first detail context and hides placeholder share UI", () => {
    localSearchParamsMock.template = JSON.stringify({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Tempo Builder",
      activity_category: "run",
      profile_id: "profile-1",
      description: "Controlled tempo intervals.",
      notes: "Keep the recoveries honest.",
      structure: { intervals: [] },
    });

    renderNative(<ActivityPlanDetail />);

    expect(screen.getByText("Controlled tempo intervals.")).toBeTruthy();
    expect(screen.getByText("Keep the recoveries honest.")).toBeTruthy();
    expect(screen.getByText("Comments (0)")).toBeTruthy();
    expect(screen.queryByText("Share")).toBeNull();
  });
});
