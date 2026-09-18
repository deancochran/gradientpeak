import { getActivityPlanPrintFormatLabel } from "@repo/core/activity-plan";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { act, waitFor } from "@testing-library/react-native";
import React from "react";
import {
  createActivityPlanDetail,
  createActivityPlanStructure,
  createActivityPlanSummary,
} from "../../../../test/activity-plan-projection-fixture";
import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

var alertMock = jest.fn();
var duplicateMutateMock = jest.fn();
const sharePdfMock = jest.fn();
const printPdfMock = jest.fn();
jest.mock("@/lib/activity-plan-export/activity-plan-pdf", () => ({
  shareActivityPlanPdf: (...args: unknown[]) => sharePdfMock(...args),
  printActivityPlanPdf: (...args: unknown[]) => printPdfMock(...args),
}));
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

var fetchedPlanMock = {
  current: null as ActivityPlanMock | null,
};
var plannedActivityMock = {
  current: null as PlannedActivityMock | null,
};
var activityPlanQueryInputs = [] as unknown[];
var eventQueryInputs = [] as unknown[];
var readModelQueryOptions = [] as unknown[];
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

jest.mock("@/components/activity-plan/activity/TimelineChart", () => ({
  __esModule: true,
  TimelineChart: createHost("TimelineChart"),
}));

jest.mock("@/components/shared/ProfilePreviewChart", () => ({
  __esModule: true,
  ProfilePreviewChart: createHost("ProfilePreviewChart"),
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
        useQuery: (input: unknown) => {
          activityPlanQueryInputs.push(input);
          return {
            data: fetchedPlanMock.current ? { detail: fetchedPlanMock.current, edit: null } : null,
            isLoading: false,
          };
        },
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
    athleteIntelligence: {
      getReadModel: {
        useQuery: (_input: unknown, options: unknown) => {
          readModelQueryOptions.push(options);
          return {
            data:
              (options as { enabled?: boolean }).enabled === true
                ? {
                    publishedState: {
                      performanceTargets: buildPerformanceTargetFactsFixture({
                        asOf: "2026-08-18T12:00:00.000Z",
                        athleteId: "profile-1",
                        bikeThresholdWatts: 300,
                      }),
                    },
                  }
                : undefined,
          };
        },
      },
    },
    events: {
      getById: {
        useQuery: (input: unknown) => {
          eventQueryInputs.push(input);
          return { data: plannedActivityMock.current, error: null, isLoading: false };
        },
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
  ...jest.requireActual("@repo/core"),
  decodePolyline: () => null,
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
    return screen.container.queryAll((node) => node.type === type);
  } catch {
    return [];
  }
};

const _findButton = (matcher: (label: string) => boolean) =>
  getAllByTypeOrEmpty("Button").find((node) => matcher(getTextContent(node.props?.children)));

const resetTestState = () => {
  fetchedPlanMock.current = null;
  plannedActivityMock.current = null;
  activityPlanQueryInputs = [];
  eventQueryInputs = [];
  readModelQueryOptions = [];
  alertMock.mockReset();
  nativeAlertMock.mockReset();
  duplicateMutateMock.mockReset();
  sharePdfMock.mockReset().mockResolvedValue(undefined);
  printPdfMock.mockReset().mockResolvedValue(undefined);
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

  it("routes the selected PDF format to mocked sharing and printing with failure feedback", async () => {
    localSearchParamsMock.template = JSON.stringify(
      createActivityPlanSummary({
        id: "11111111-1111-4111-8111-111111111111",
        name: "Pool plan",
        activityCategory: "swim",
        structure: createActivityPlanStructure("swim"),
      }),
    );
    sharePdfMock.mockRejectedValueOnce(new Error("Share unavailable"));
    await renderNative(<ActivityPlanDetail />);
    const selectFormat = async () => {
      if (!screen.queryByTestId("activity-plan-options-export-pdf"))
        await act(() => screen.getByTestId("activity-plan-options-trigger").props.onPress());
      await act(() => screen.getByTestId("activity-plan-options-export-pdf").props.onPress());
      const formats = nativeAlertMock.mock.calls.at(-1)?.[2] as Array<{
        text: string;
        onPress?: () => void;
      }>;
      await act(() =>
        formats
          .find((choice) => choice.text === getActivityPlanPrintFormatLabel("swim-deck-card"))
          ?.onPress?.(),
      );
    };
    await selectFormat();
    const actions = nativeAlertMock.mock.calls.at(-1)?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    await act(async () => actions.find((choice) => choice.text === "Share PDF")?.onPress?.());
    expect(sharePdfMock).toHaveBeenCalledWith(
      expect.objectContaining({ format: "swim-deck-card", title: "Pool plan" }),
    );
    expect(nativeAlertMock).toHaveBeenCalledWith("Share failed", expect.any(String));
    await selectFormat();
    const retryActions = nativeAlertMock.mock.calls.at(-1)?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    await act(async () => retryActions.find((choice) => choice.text === "Print")?.onPress?.());
    expect(printPdfMock).toHaveBeenCalledWith(
      expect.objectContaining({ format: "swim-deck-card", title: "Pool plan" }),
    );
  });

  it("opens event creation for a schedulable template plan", async () => {
    localSearchParamsMock.template = JSON.stringify(
      createActivityPlanSummary({
        id: "11111111-1111-1111-1111-111111111111",
        name: "Tempo Builder",
      }),
    );

    await renderNative(<ActivityPlanDetail />);

    await act(() => {
      screen.getByTestId("activity-plan-options-trigger").props.onPress();
    });
    await act(() => {
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

  it("keeps shared-plan scheduling available and exposes an unavailable conversion toggle", async () => {
    localSearchParamsMock.template = JSON.stringify(
      createActivityPlanSummary({
        id: "11111111-1111-1111-1111-111111111111",
        name: "Shared Builder",
        capabilities: {
          canLike: true,
          canEdit: false,
          canDelete: false,
          canDuplicate: false,
          canSchedule: true,
          canRecord: false,
        },
      }),
    );

    await renderNative(<ActivityPlanDetail />);

    await act(() => {
      screen.getByTestId("activity-plan-options-trigger").props.onPress();
    });
    expect(screen.getByTestId("activity-plan-options-schedule")).toBeTruthy();
    expect(screen.getByTestId("activity-plan-options-export-pdf")).toBeTruthy();
    expect(screen.queryByTestId("activity-plan-options-duplicate")).toBeNull();
    expect(screen.queryByTestId("activity-plan-options-start")).toBeNull();
    expect(screen.getByTestId("activity-plan-personalize-targets").props.checked).toBe(false);
    expect(screen.getByTestId("activity-plan-personalize-targets").props.disabled).toBe(true);
    expect(screen.getByTestId("activity-plan-content-preview")).toBeTruthy();
    expect(screen.getByText("5min at 5 RPE")).toBeTruthy();

    await act(() => {
      screen.getByTestId("activity-plan-options-schedule").props.onPress();
    });

    expect(routerMock.navigate).toHaveBeenCalledWith({
      pathname: "/event-detail",
      params: {
        activityPlanId: "11111111-1111-1111-1111-111111111111",
        mode: "create",
      },
    });
  });

  it("duplicates a public system template into the owned detail flow", async () => {
    localSearchParamsMock.template = JSON.stringify(
      createActivityPlanSummary({
        id: "11111111-1111-1111-1111-111111111111",
        name: "Tempo Builder",
        visibility: "public",
        isSystemTemplate: true,
        capabilities: {
          canLike: true,
          canEdit: false,
          canDelete: false,
          canDuplicate: true,
          canSchedule: true,
          canRecord: false,
        },
      }),
    );

    await renderNative(<ActivityPlanDetail />);

    await act(async () => {
      screen.getByTestId("activity-plan-options-trigger").props.onPress();
    });
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
    await act(() => {
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
    fetchedPlanMock.current = createActivityPlanDetail({
      id: "owned-plan-1",
      name: "Owned Builder",
    });
    localSearchParamsMock.planId = "owned-plan-1";
    localSearchParamsMock.action = "schedule";

    await renderNative(<ActivityPlanDetail />);

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
    fetchedPlanMock.current = createActivityPlanDetail({
      id: "owned-plan-1",
      name: "Owned Builder",
    });
    localSearchParamsMock.planId = "owned-plan-1";
    localSearchParamsMock.eventId = "event-1";
    localSearchParamsMock.action = "schedule";
    plannedActivityMock.current = { id: "event-1", scheduled_date: "2026-05-21" };

    await renderNative(<ActivityPlanDetail />);

    await waitFor(() => {
      expect(routerMock.navigate).toHaveBeenCalledWith("/event-detail-update?id=event-1");
    });
    expect(nativeAlertMock).not.toHaveBeenCalled();
  });

  it("navigates to event creation when scheduling a fetched plan", async () => {
    fetchedPlanMock.current = createActivityPlanDetail({
      id: "owned-plan-1",
      name: "Owned Builder",
    });

    await renderNative(<ActivityPlanDetail />);

    await act(() => {
      screen.getByTestId("activity-plan-options-trigger").props.onPress();
    });
    await act(() => {
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

  it("hides schedule actions when the plan is opened from an event", async () => {
    fetchedPlanMock.current = createActivityPlanDetail({
      id: "owned-plan-1",
      name: "Owned Builder",
    });
    localSearchParamsMock.planId = "owned-plan-1";
    localSearchParamsMock.eventId = "event-1";

    await renderNative(<ActivityPlanDetail />);

    expect(screen.queryByTestId("activity-plan-options-schedule")).toBeNull();
    expect(screen.queryByTestId("activity-plan-options-open-event")).toBeNull();
    expect(screen.queryByTestId("activity-plan-options-remove-schedule")).toBeNull();
  });

  it("shows the new summary-first detail context and attribution-row share action", async () => {
    localSearchParamsMock.template = JSON.stringify(
      createActivityPlanDetail({
        id: "11111111-1111-1111-1111-111111111111",
        name: "Tempo Builder",
        description: "Controlled tempo intervals.",
        notes: "Keep the recoveries honest.",
      }),
    );

    await renderNative(<ActivityPlanDetail />);

    expect(screen.getByText(/Controlled tempo intervals\./)).toBeTruthy();
    expect(screen.getByText(/Keep the recoveries honest\./)).toBeTruthy();
    expect(screen.getByTestId("activity-plan-comments-button")).toBeTruthy();
    expect(screen.getByTestId("activity-plan-share-button")).toBeTruthy();
  });

  it("defaults an eligible owner session flow on without changing the authored API projection", async () => {
    const plan = createActivityPlanDetail({ id: "bike-plan-1", activityCategory: "bike" });
    if (!plan.structure) throw new Error("Expected owner authoring structure");
    const structure = structuredClone(plan.structure);
    structure.activity_category = "bike";
    const segment = structure.segments[0];
    if (!segment || segment.role !== "activity") throw new Error("Expected activity segment");
    const step = segment.intervals[0]?.steps[0];
    if (!step) throw new Error("Expected activity step");
    step.targets = [{ type: "%FTP", intensity: 80 }];
    fetchedPlanMock.current = createActivityPlanDetail({
      id: "bike-plan-1",
      activityCategory: "bike",
      structure,
    });

    const view = await renderNative(<ActivityPlanDetail />);

    const toggle = screen.getByTestId("activity-plan-personalize-targets");
    expect(toggle.props.checked).toBe(true);
    expect(screen.getByText(/240 W/)).toBeTruthy();
    expect(activityPlanQueryInputs).toContainEqual(expect.objectContaining({ personalize: false }));
    expect(eventQueryInputs).toContainEqual(expect.objectContaining({ personalize: false }));
    expect(readModelQueryOptions).toContainEqual(
      expect.objectContaining({ enabled: true, refetchOnWindowFocus: false }),
    );

    await act(() => toggle.props.onCheckedChange(false));

    expect(screen.getByText(/80% FTP/)).toBeTruthy();
    expect(screen.queryByText(/240 W/)).toBeNull();
    expect(activityPlanQueryInputs).not.toContainEqual(
      expect.objectContaining({ personalize: true }),
    );
    expect(eventQueryInputs).not.toContainEqual(expect.objectContaining({ personalize: true }));

    fetchedPlanMock.current = createActivityPlanDetail({
      id: "bike-plan-2",
      activityCategory: "bike",
      structure,
    });
    localSearchParamsMock.planId = "bike-plan-2";
    await view.rerender(<ActivityPlanDetail />);
    expect(screen.getByTestId("activity-plan-personalize-targets").props.checked).toBe(true);
  });

  it("keeps an owner RPE session flow off and explains why it cannot be personalized", async () => {
    fetchedPlanMock.current = createActivityPlanDetail({
      id: "rpe-plan-1",
      activityCategory: "run",
    });

    await renderNative(<ActivityPlanDetail />);

    const toggle = screen.getByTestId("activity-plan-personalize-targets");
    expect(toggle.props.checked).toBe(false);
    expect(toggle.props.disabled).toBe(true);
    expect(screen.getByText(/5 RPE/)).toBeTruthy();
  });
});
