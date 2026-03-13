import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );

  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

const loadActivityPlanDetail = async () =>
  (await import("../activity-plan-detail")).default;

const {
  alertMock,
  duplicateMutateMock,
  fetchedPlanMock,
  localSearchParamsMock,
  scheduleModalProps,
  routerMock,
} = vi.hoisted(() => ({
  alertMock: vi.fn(),
  duplicateMutateMock: vi.fn(),
  fetchedPlanMock: {
    current: null as Record<string, any> | null,
  },
  localSearchParamsMock: {} as Record<string, string | undefined>,
  scheduleModalProps: [] as any[],
  routerMock: {
    back: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  },
}));

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

function getTextContent(children: any): string {
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
}

vi.mock("expo-router", () => ({
  useRouter: () => routerMock,
  useLocalSearchParams: () => localSearchParamsMock,
}));

vi.mock("react-native", () => ({
  ActivityIndicator: createHost("ActivityIndicator"),
  Alert: { alert: alertMock },
  Pressable: createHost("Pressable"),
  ScrollView: createHost("ScrollView"),
  TextInput: createHost("TextInput"),
  View: createHost("View"),
}));

vi.mock("react-native-maps", () => ({
  __esModule: true,
  default: createHost("MapView"),
  Polyline: createHost("Polyline"),
  PROVIDER_DEFAULT: "default",
}));

vi.mock("@/components/ActivityPlan/TimelineChart", () => ({
  TimelineChart: createHost("TimelineChart"),
}));

vi.mock("@/components/ScheduleActivityModal", () => ({
  ScheduleActivityModal: (props: any) => {
    scheduleModalProps.push(props);
    return React.createElement("ScheduleActivityModal", props, props.children);
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: createHost("Button"),
}));

vi.mock("@/components/ui/icon", () => ({
  Icon: createHost("Icon"),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: createHost("Switch"),
}));

vi.mock("@/components/ui/text", () => ({
  Text: createHost("Text"),
}));

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ profile: { id: "profile-1" } }),
}));

vi.mock("@/lib/hooks/useDeletedDetailRedirect", () => ({
  useDeletedDetailRedirect: () => ({
    beginRedirect: vi.fn(),
    isRedirecting: false,
    redirectOnNotFound: vi.fn(),
  }),
}));

vi.mock("@/lib/stores/activitySelectionStore", () => ({
  activitySelectionStore: { setSelection: vi.fn() },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      activityPlans: {
        list: { invalidate: vi.fn() },
        getUserPlansCount: { invalidate: vi.fn() },
        getById: { invalidate: vi.fn() },
      },
      events: {
        invalidate: vi.fn(),
        list: { invalidate: vi.fn() },
        getToday: { invalidate: vi.fn() },
      },
      trainingPlans: { invalidate: vi.fn() },
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
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      update: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    events: {
      getById: {
        useQuery: () => ({ data: null, error: null, isLoading: false }),
      },
      delete: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    routes: {
      get: {
        useQuery: () => ({ data: null }),
      },
    },
    social: {
      toggleLike: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      getComments: {
        useQuery: () => ({
          data: { comments: [], total: 0 },
          refetch: vi.fn(),
        }),
      },
      addComment: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

vi.mock("@/lib/utils/durationConversion", () => ({
  getDurationMs: () => 0,
}));

vi.mock("@repo/core", () => ({
  buildEstimationContext: () => ({}),
  decodePolyline: () => null,
  estimateActivity: () => null,
  getStepIntensityColor: () => "#000000",
}));

vi.mock("lucide-react-native", () => ({
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

describe("activity plan detail scheduling", () => {
  it("opens the scheduling modal for a schedulable template plan", async () => {
    fetchedPlanMock.current = null;
    scheduleModalProps.length = 0;
    alertMock.mockReset();
    duplicateMutateMock.mockReset();
    localSearchParamsMock.template = JSON.stringify({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Tempo Builder",
      activity_category: "run",
      profile_id: "profile-1",
      structure: { intervals: [] },
    });
    localSearchParamsMock.planId = undefined;
    localSearchParamsMock.eventId = undefined;
    localSearchParamsMock.action = undefined;

    const ActivityPlanDetail = await loadActivityPlanDetail();
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<ActivityPlanDetail />);
    });

    const scheduleButton = renderer.root.findAll(
      (node) =>
        (node.type as any) === "Button" &&
        getTextContent(node.props.children).includes("Schedule"),
    )[0];

    await act(async () => {
      scheduleButton?.props.onPress();
    });

    expect(alertMock).not.toHaveBeenCalled();
    expect(scheduleModalProps.at(-1)?.visible).toBe(true);
  });

  it("shows a visible alert instead of silently doing nothing for an unsaved template", async () => {
    fetchedPlanMock.current = null;
    scheduleModalProps.length = 0;
    alertMock.mockReset();
    duplicateMutateMock.mockReset();
    localSearchParamsMock.template = JSON.stringify({
      name: "Draft Template",
      activity_category: "run",
      profile_id: "profile-1",
      structure: { intervals: [] },
    });
    localSearchParamsMock.planId = undefined;
    localSearchParamsMock.eventId = undefined;
    localSearchParamsMock.action = undefined;

    const ActivityPlanDetail = await loadActivityPlanDetail();
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<ActivityPlanDetail />);
    });

    const scheduleButton = renderer.root.findAll(
      (node) =>
        (node.type as any) === "Button" &&
        getTextContent(node.props.children).includes("Schedule"),
    )[0];

    await act(async () => {
      scheduleButton?.props.onPress();
    });

    expect(alertMock).toHaveBeenCalledWith(
      "Scheduling unavailable",
      "Create this activity plan first, then schedule it from its detail screen.",
    );
    expect(scheduleModalProps.at(-1)?.visible).toBe(false);
  });

  it("duplicates and routes into scheduling for a shared template", async () => {
    fetchedPlanMock.current = null;
    scheduleModalProps.length = 0;
    alertMock.mockReset();
    duplicateMutateMock.mockReset();
    routerMock.replace.mockReset();
    localSearchParamsMock.template = JSON.stringify({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Shared Builder",
      activity_category: "run",
      profile_id: "another-profile",
      structure: { intervals: [] },
    });
    localSearchParamsMock.planId = undefined;
    localSearchParamsMock.eventId = undefined;
    localSearchParamsMock.action = undefined;

    const ActivityPlanDetail = await loadActivityPlanDetail();
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<ActivityPlanDetail />);
    });

    const scheduleButton = renderer.root.findAll(
      (node) =>
        (node.type as any) === "Button" &&
        getTextContent(node.props.children).includes("Schedule"),
    )[0];

    await act(async () => {
      scheduleButton?.props.onPress();
    });

    expect(duplicateMutateMock).toHaveBeenCalledWith({
      id: "11111111-1111-1111-1111-111111111111",
      newName: "Shared Builder (Copy)",
    });
    expect(alertMock).not.toHaveBeenCalled();
    expect(routerMock.replace).toHaveBeenCalledWith({
      pathname: "/activity-plan-detail",
      params: { planId: "duplicated-plan-1", action: "schedule" },
    });
    expect(scheduleModalProps.at(-1)?.visible).toBe(false);
  });

  it("duplicates a shared activity plan into the owned detail flow", async () => {
    fetchedPlanMock.current = null;
    scheduleModalProps.length = 0;
    alertMock.mockReset();
    duplicateMutateMock.mockReset();
    routerMock.replace.mockReset();
    localSearchParamsMock.template = JSON.stringify({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Tempo Builder",
      activity_category: "run",
      profile_id: "template-owner",
      structure: { intervals: [] },
    });
    localSearchParamsMock.planId = undefined;
    localSearchParamsMock.eventId = undefined;
    localSearchParamsMock.action = undefined;

    const ActivityPlanDetail = await loadActivityPlanDetail();
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<ActivityPlanDetail />);
    });

    const duplicateButton = renderer.root.findAll(
      (node) =>
        (node.type as any) === "Button" &&
        getTextContent(node.props.children) === "Duplicate",
    )[0];

    await act(async () => {
      duplicateButton?.props.onPress();
      await Promise.resolve();
    });

    expect(duplicateMutateMock).toHaveBeenCalledWith({
      id: "11111111-1111-1111-1111-111111111111",
      newName: "Tempo Builder (Copy)",
    });
    const duplicateAlertButtons = alertMock.mock.calls.at(-1)?.[2] as
      | Array<{ onPress?: () => void }>
      | undefined;
    duplicateAlertButtons?.[0]?.onPress?.();
    expect(routerMock.replace).toHaveBeenCalledWith({
      pathname: "/activity-plan-detail",
      params: { planId: "duplicated-plan-1" },
    });
  });

  it("opens scheduling immediately for a routed owned plan", async () => {
    fetchedPlanMock.current = {
      id: "owned-plan-1",
      name: "Owned Builder",
      activity_category: "run",
      profile_id: "profile-1",
      structure: { intervals: [] },
    };
    scheduleModalProps.length = 0;
    alertMock.mockReset();
    duplicateMutateMock.mockReset();
    localSearchParamsMock.template = undefined;
    localSearchParamsMock.planId = "owned-plan-1";
    localSearchParamsMock.action = "schedule";
    localSearchParamsMock.eventId = undefined;

    const ActivityPlanDetail = await loadActivityPlanDetail();

    await act(async () => {
      TestRenderer.create(<ActivityPlanDetail />);
    });

    expect(scheduleModalProps.at(-1)?.visible).toBe(true);
    expect(alertMock).not.toHaveBeenCalled();
  });
});
