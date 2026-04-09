import { act, waitFor } from "@testing-library/react-native";
import React from "react";
import { renderNative, screen } from "../../../../test/render-native";

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

const localSearchParamsMock = {} as Record<string, string | undefined>;
const routerMock = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };
const alertMock = jest.fn();
const toggleLikeMutateMock = jest.fn();
const addCommentMutateMock = jest.fn();
const refetchCommentsMock = jest.fn();

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
  ScheduleActivityModal: createHost("ScheduleActivityModal"),
}));

jest.mock("@repo/ui/components/button", () => ({ __esModule: true, Button: createHost("Button") }));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/switch", () => ({ __esModule: true, Switch: createHost("Switch") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
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
      getById: { useQuery: () => ({ data: null, isLoading: false }) },
      duplicate: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
      delete: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
      update: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
    },
    events: {
      getById: { useQuery: () => ({ data: null, error: null, isLoading: false }) },
      delete: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
    },
    routes: { get: { useQuery: () => ({ data: null }) } },
    social: {
      toggleLike: { useMutation: () => ({ mutate: toggleLikeMutateMock, isPending: false }) },
      getComments: {
        useQuery: () => ({
          data: {
            total: 1,
            comments: [
              {
                id: "comment-1",
                content: "Nice session",
                created_at: "2026-02-13T00:00:00.000Z",
                profile: { username: "Runner" },
              },
            ],
          },
          refetch: refetchCommentsMock,
        }),
      },
      addComment: {
        useMutation: (options: any) => ({
          mutate: (input: any) => {
            addCommentMutateMock(input);
            options?.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
  },
}));

jest.mock("@/lib/utils/durationConversion", () => ({ __esModule: true, getDurationMs: () => 0 }));
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
  MessageCircle: "MessageCircle",
  Send: "Send",
  Smartphone: "Smartphone",
  Trash2: "Trash2",
}));

const ActivityPlanDetail = require("../activity-plan-detail").default;
const nativeAlertMock = require("react-native").Alert.alert as jest.Mock;

const getTextContent = (children: any): string => {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map((child) => getTextContent(child)).join("");
  if (children?.props?.children !== undefined) return getTextContent(children.props.children);
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

describe("activity plan detail social orchestration", () => {
  beforeEach(() => {
    toggleLikeMutateMock.mockReset();
    addCommentMutateMock.mockReset();
    refetchCommentsMock.mockReset();
    alertMock.mockReset();
    nativeAlertMock.mockReset();
    routerMock.back.mockReset();
    routerMock.push.mockReset();
    routerMock.replace.mockReset();
    Object.keys(localSearchParamsMock).forEach((key) => delete localSearchParamsMock[key]);
  });

  it("toggles like through the social mutation", () => {
    localSearchParamsMock.template = JSON.stringify({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Tempo Builder",
      activity_category: "run",
      profile_id: "profile-1",
      structure: { intervals: [] },
      has_liked: false,
      likes_count: 0,
    });

    renderNative(<ActivityPlanDetail />);

    act(() => {
      screen.getByTestId("activity-plan-like-button").props.onPress();
    });

    expect(toggleLikeMutateMock).toHaveBeenCalledWith({
      entity_id: "11111111-1111-1111-1111-111111111111",
      entity_type: "activity_plan",
    });
  });

  it("shows an alert instead of liking an unsaved template", () => {
    localSearchParamsMock.template = JSON.stringify({
      name: "Draft Template",
      activity_category: "run",
      profile_id: "profile-1",
      structure: { intervals: [] },
    });

    renderNative(<ActivityPlanDetail />);

    act(() => {
      screen.getByTestId("activity-plan-like-button").props.onPress();
    });

    expect(nativeAlertMock).toHaveBeenCalledWith("Error", "Cannot like this item - invalid ID");
    expect(toggleLikeMutateMock).not.toHaveBeenCalled();
  });

  it("adds a trimmed comment and clears via success flow", async () => {
    localSearchParamsMock.template = JSON.stringify({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Tempo Builder",
      activity_category: "run",
      profile_id: "profile-1",
      structure: { intervals: [] },
    });

    renderNative(<ActivityPlanDetail />);

    const textarea = getAllByTypeOrEmpty("Textarea")[0];
    act(() => {
      textarea.props.onChangeText("  Great work  ");
    });

    await act(async () => {
      screen.getByTestId("activity-plan-add-comment-button").props.onPress();
      await Promise.resolve();
    });

    expect(addCommentMutateMock).toHaveBeenCalledWith({
      entity_id: "11111111-1111-1111-1111-111111111111",
      entity_type: "activity_plan",
      content: "Great work",
    });
    await waitFor(() => {
      expect(refetchCommentsMock).toHaveBeenCalled();
    });
  });
});
