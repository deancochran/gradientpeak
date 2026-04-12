import { act, waitFor } from "@testing-library/react-native";
import React from "react";
import { renderNative, screen } from "../../../../test/render-native";

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

var alertMock = jest.fn();
var duplicateMutateMock = jest.fn();
var fetchedPlanMock = {
  current: null as Record<string, any> | null,
};
var localSearchParamsMock = {} as Record<string, string | undefined>;
var scheduleModalProps: any[] = [];
var routerMock = {
  back: jest.fn(),
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

jest.mock("@/components/ActivityPlan/TimelineChart", () => ({
  __esModule: true,
  TimelineChart: createHost("TimelineChart"),
}));

jest.mock("@/components/ScheduleActivityModal", () => ({
  __esModule: true,
  ScheduleActivityModal: (props: any) => {
    scheduleModalProps.push(props);
    return React.createElement("ScheduleActivityModal", props, props.children);
  },
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createHost("Button"),
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
        useMutation: (options: any) => ({
          mutate: (input: any) => {
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
        useQuery: () => ({ data: null, error: null, isLoading: false }),
      },
      delete: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false }),
      },
    },
    routes: {
      get: {
        useQuery: () => ({ data: null }),
      },
    },
    social: {
      toggleLike: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false }),
      },
      getComments: {
        useQuery: () => ({
          data: { comments: [], total: 0 },
          refetch: jest.fn(),
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

const getTextContent = (children: any): string => {
  if (typeof children === "string") {
    return children;
  }
  if (typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map((child) => getTextContent(child)).join("");
  }
  if (children?.props?.children !== undefined) {
    return getTextContent(children.props.children);
  }
  return "";
};

const getAllByTypeOrEmpty = (type: string) => {
  try {
    return (screen as any).UNSAFE_getAllByType(type);
  } catch {
    return [];
  }
};

const findButton = (matcher: (label: string) => boolean) =>
  getAllByTypeOrEmpty("Button").find((node: any) => matcher(getTextContent(node.props?.children)));

const resetTestState = () => {
  fetchedPlanMock.current = null;
  scheduleModalProps.length = 0;
  alertMock.mockReset();
  nativeAlertMock.mockReset();
  duplicateMutateMock.mockReset();
  routerMock.back.mockReset();
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

  it("opens the scheduling modal for a schedulable template plan", () => {
    localSearchParamsMock.template = JSON.stringify({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Tempo Builder",
      activity_category: "run",
      profile_id: "profile-1",
      structure: { intervals: [] },
    });

    renderNative(<ActivityPlanDetail />);

    act(() => {
      findButton((label) => label === "Schedule").props.onPress();
    });

    expect(nativeAlertMock).not.toHaveBeenCalled();
    expect(scheduleModalProps.at(-1)?.visible).toBe(true);
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
      findButton((label) => label === "Schedule").props.onPress();
    });

    expect(nativeAlertMock).toHaveBeenCalledWith(
      "Scheduling unavailable",
      "Create this activity plan first, then schedule it from its detail screen.",
    );
    expect(scheduleModalProps.at(-1)?.visible).toBe(false);
  });

  it("duplicates and routes into scheduling for a shared template", async () => {
    localSearchParamsMock.template = JSON.stringify({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Shared Builder",
      activity_category: "run",
      profile_id: "another-profile",
      structure: { intervals: [] },
    });

    renderNative(<ActivityPlanDetail />);

    await act(async () => {
      findButton((label) => label === "Duplicate and Schedule").props.onPress();
      await Promise.resolve();
    });

    expect(duplicateMutateMock).toHaveBeenCalledWith({
      id: "11111111-1111-1111-1111-111111111111",
      newName: "Shared Builder (Copy)",
    });
    expect(nativeAlertMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(routerMock.replace).toHaveBeenCalledWith({
        pathname: "/activity-plan-detail",
        params: { planId: "duplicated-plan-1", action: "schedule" },
      });
    });
    expect(scheduleModalProps.at(-1)?.visible).toBe(false);
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
      findButton((label) => label === "Duplicate").props.onPress();
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

  it("opens scheduling immediately for a routed owned plan", () => {
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

    expect(scheduleModalProps.at(-1)?.visible).toBe(true);
    expect(nativeAlertMock).not.toHaveBeenCalled();
  });

  it("opens rescheduling immediately for a routed scheduled activity", () => {
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

    renderNative(<ActivityPlanDetail />);

    expect(scheduleModalProps.at(-1)?.visible).toBe(true);
    expect(scheduleModalProps.at(-1)?.eventId).toBe("event-1");
    expect(nativeAlertMock).not.toHaveBeenCalled();
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

    expect(screen.getByText("Overview")).toBeTruthy();
    expect(screen.getByText("Controlled tempo intervals.")).toBeTruthy();
    expect(screen.getByText("Notes")).toBeTruthy();
    expect(screen.getByText("Comments (0)")).toBeTruthy();
    expect(screen.queryByText("Share")).toBeNull();
  });
});
