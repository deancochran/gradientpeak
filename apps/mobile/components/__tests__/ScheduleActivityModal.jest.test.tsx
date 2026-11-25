import React from "react";
import type { TestInstance as ReactTestInstance } from "test-renderer";
import { createActivityPlanDetail } from "../../test/activity-plan-projection-fixture";
import { createHost, type HostProps } from "../../test/mock-components";
import { act, fireEvent, renderNative, screen, waitFor } from "../../test/render-native";

const alertMock = jest.fn();
const createMutateAsyncMock = jest.fn();
const updateMutateMock = jest.fn();
const setErrorMock = jest.fn();
const clearErrorsMock = jest.fn();
const refreshScheduleWithCallbacksMock = jest.fn();
const activityPlanId = "11111111-1111-4111-8111-111111111111";

type ExistingActivityData = {
  id: string;
  scheduled_date: string;
  starts_at: string;
  all_day: boolean;
  notes: string;
  series_id?: string;
  occurrence_key?: string;
  recurrence_rule?: string;
  activity_plan_id?: string | null;
  activityPlanSummary: ReturnType<typeof createActivityPlanDetail> | null;
};

let existingActivityData: ExistingActivityData | null = null;
let profileId: string | null = "22222222-2222-4222-8222-222222222222";
let planDetails: ReturnType<typeof createActivityPlanDetail> | null = createActivityPlanDetail({
  id: "plan-1",
  name: "Tempo Builder",
  description: "Progressive tempo session with structured intervals.",
});

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: alertMock },
  Modal: ({ visible, children, ...props }: HostProps & { visible?: boolean }) =>
    visible ? React.createElement("Modal", props, children) : null,
}));

jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: createHost("DateTimePicker"),
}));

jest.mock("@repo/ui/hooks", () => {
  const React = require("react");
  const hooks = jest.requireActual("@repo/ui/hooks");

  return {
    __esModule: true,
    ...hooks,
    useZodForm: (...args: Parameters<typeof hooks.useZodForm>) => {
      const form = hooks.useZodForm(...args);
      const isInstrumented = React.useRef(false);

      if (!isInstrumented.current) {
        const originalSetError = form.setError;
        const originalClearErrors = form.clearErrors;

        form.setError = (...setErrorArgs: Parameters<typeof originalSetError>) => {
          setErrorMock(...setErrorArgs);
          return originalSetError(...setErrorArgs);
        };
        form.clearErrors = (...clearErrorArgs: Parameters<typeof originalClearErrors>) => {
          clearErrorsMock(...clearErrorArgs);
          return originalClearErrors(...clearErrorArgs);
        };
        isInstrumented.current = true;
      }

      return form;
    },
  };
});

jest.mock("@/components/activity-plan/activity/TimelineChart", () => ({
  __esModule: true,
  TimelineChart: createHost("TimelineChart"),
}));

jest.mock("@/components/activity-plan/ActivityPlanContentPreview", () => ({
  __esModule: true,
  ActivityPlanContentPreview: createHost("ActivityPlanContentPreview"),
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: createHost("ActivityPlanCard"),
}));

jest.mock("@/components/shared/AppFormModal", () => ({
  __esModule: true,
  AppFormModal: ({
    children,
    footerContent,
    ...props
  }: HostProps & { footerContent?: React.ReactNode }) =>
    React.createElement("AppFormModal", props, children, footerContent),
  AppConfirmModal: createHost("AppConfirmModal"),
}));

jest.mock("@repo/ui/components/button", () => ({ __esModule: true, Button: createHost("Button") }));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));
jest.mock("@repo/ui/components/form", () => ({
  __esModule: true,
  Form: createHost("Form"),
  FormDateInputField: ({ testId, ...props }: HostProps & { testId?: string }) =>
    React.createElement("FormDateInputField", { testID: testId, ...props }, props.children),
  FormSwitchField: createHost("FormSwitchField"),
  FormTimeInputField: ({ testId, ...props }: HostProps & { testId?: string }) =>
    React.createElement("FormTimeInputField", { testID: testId, ...props }, props.children),
  FormTextareaField: createHost("FormTextareaField"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/switch", () => ({
  __esModule: true,
  Switch: createHost("Switch"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@repo/ui/components/textarea", () => ({
  __esModule: true,
  Textarea: createHost("Textarea"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  AlertTriangle: createHost("AlertTriangle"),
  Calendar: createHost("Calendar"),
  Check: createHost("Check"),
  ChevronDown: createHost("ChevronDown"),
  ChevronUp: createHost("ChevronUp"),
  Clock: createHost("Clock"),
  TrendingUp: createHost("TrendingUp"),
  X: createHost("X"),
}));

jest.mock("@/lib/scheduling/refreshScheduleViews", () => ({
  __esModule: true,
  refreshScheduleWithCallbacks: refreshScheduleWithCallbacksMock,
}));

jest.mock("@/lib/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: (selector: (state: { profile: { id: string } | null }) => unknown) =>
    selector({ profile: profileId ? { id: profileId } : null }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    events: {
      getById: { useQuery: () => ({ data: existingActivityData, isLoading: false }) },
      create: { useMutation: () => ({ isPending: false, error: null, mutateAsync: jest.fn() }) },
      update: { useMutation: () => ({ isPending: false, error: null, mutate: updateMutateMock }) },
    },
    plannedSessions: {
      create: {
        useMutation: () => ({
          isPending: false,
          error: null,
          mutateAsync: createMutateAsyncMock,
        }),
      },
    },
    activityPlans: {
      getById: {
        useQuery: () => ({
          data: {
            detail: planDetails,
            edit: null,
          },
          isLoading: false,
        }),
      },
    },
    routes: {
      get: {
        useQuery: () => ({ data: null, isLoading: false }),
      },
    },
  },
}));

const { ScheduleActivityModal } = require("../ScheduleActivityModal");

describe("ScheduleActivityModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createMutateAsyncMock.mockResolvedValue(undefined);
    refreshScheduleWithCallbacksMock.mockResolvedValue(undefined);
    existingActivityData = null;
    profileId = "22222222-2222-4222-8222-222222222222";
    planDetails = createActivityPlanDetail({
      id: "plan-1",
      name: "Tempo Builder",
      description: "Progressive tempo session with structured intervals.",
    });
  });

  it("shows the selected activity preview", async () => {
    const rendered = await renderNative(
      <ScheduleActivityModal visible onClose={jest.fn()} activityPlanId={activityPlanId} />,
    );

    expect(screen.getByTestId("schedule-preview-details")).toBeTruthy();
    expect(
      rendered.container.queryAll(
        (node: ReactTestInstance) => String(node.type) === "ActivityPlanCard",
      )[0]?.props.variant,
    ).toBe("compact");
  });

  it("submits a date-key-only planned activity", async () => {
    const onClose = jest.fn();
    await renderNative(
      <ScheduleActivityModal
        visible
        onClose={onClose}
        activityPlanId={activityPlanId}
        preselectedDate="2026-06-02"
      />,
    );

    await fireEvent.press(screen.getByTestId("schedule-submit-button"));

    await waitFor(() => {
      expect(createMutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: "22222222-2222-4222-8222-222222222222",
          session: expect.objectContaining({
            activityPlanId,
            planningDate: "2026-06-02",
            source: expect.objectContaining({ kind: "direct" }),
          }),
        }),
      );
    });
    expect(clearErrorsMock).toHaveBeenCalledWith("root");
    const clearOrder = clearErrorsMock.mock.invocationCallOrder[0];
    const mutationOrder = createMutateAsyncMock.mock.invocationCallOrder[0];
    expect(clearOrder).toBeDefined();
    expect(mutationOrder).toBeDefined();
    if (clearOrder === undefined || mutationOrder === undefined) {
      throw new Error("Expected root-error clearing and mutation invocation");
    }
    expect(clearOrder).toBeLessThan(mutationOrder);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(refreshScheduleWithCallbacksMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes and closes only after the mutation resolves", async () => {
    let resolveMutation: (() => void) | undefined;
    createMutateAsyncMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );
    const onClose = jest.fn();

    await renderNative(
      <ScheduleActivityModal visible onClose={onClose} activityPlanId={activityPlanId} />,
    );

    fireEvent.press(screen.getByTestId("schedule-submit-button"));
    await waitFor(() => expect(createMutateAsyncMock).toHaveBeenCalledTimes(1));

    expect(onClose).not.toHaveBeenCalled();
    expect(refreshScheduleWithCallbacksMock).not.toHaveBeenCalled();

    resolveMutation?.();

    await waitFor(() => {
      expect(refreshScheduleWithCallbacksMock).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the modal open and maps server field errors after a rejected submission", async () => {
    createMutateAsyncMock.mockRejectedValue({
      data: { zodError: { fieldErrors: { scheduledDate: ["Choose a later date"] } } },
    });
    const onClose = jest.fn();

    await renderNative(
      <ScheduleActivityModal visible onClose={onClose} activityPlanId={activityPlanId} />,
    );
    await fireEvent.press(screen.getByTestId("schedule-submit-button"));

    await waitFor(() =>
      expect(setErrorMock).toHaveBeenCalledWith(
        "scheduledDate",
        expect.objectContaining({ message: "Choose a later date" }),
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(refreshScheduleWithCallbacksMock).not.toHaveBeenCalled();
  });

  it("keeps the modal open and shows the fallback root error for an empty error property", async () => {
    createMutateAsyncMock.mockRejectedValue({ error: "" });
    const onClose = jest.fn();

    await renderNative(
      <ScheduleActivityModal visible onClose={onClose} activityPlanId={activityPlanId} />,
    );
    await fireEvent.press(screen.getByTestId("schedule-submit-button"));

    await waitFor(() =>
      expect(screen.getByText("Failed to schedule activity. Please try again.")).toBeTruthy(),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([
    ["profile", () => (profileId = null), "Profile is still loading"],
    [
      "non-executable plan",
      () =>
        (planDetails = createActivityPlanDetail({
          capabilities: {
            canLike: true,
            canEdit: true,
            canDelete: true,
            canDuplicate: true,
            canSchedule: false,
            canRecord: true,
          },
        })),
      "Only executable single-activity-category plans can be scheduled.",
    ],
  ])("keeps %s guards from mutating and preserves their error copy", async (_name, arrange, copy) => {
    arrange();

    await renderNative(
      <ScheduleActivityModal visible onClose={jest.fn()} activityPlanId={activityPlanId} />,
    );

    const submitButton = screen.queryByTestId("schedule-submit-button");
    if (submitButton) {
      await fireEvent.press(submitButton);
      await waitFor(() => expect(screen.getAllByText(copy).length).toBeGreaterThan(0));
    } else {
      expect(screen.getAllByText(copy).length).toBeGreaterThan(0);
    }
    expect(createMutateAsyncMock).not.toHaveBeenCalled();
  });

  it("keeps the unavailable-plan guard from mutating and retains its root error copy", async () => {
    planDetails = null;
    await renderNative(
      <ScheduleActivityModal visible onClose={jest.fn()} activityPlanId={activityPlanId} />,
    );

    const onPress = screen.getByTestId("schedule-submit-button").props.onPress;
    if (typeof onPress !== "function") {
      throw new Error("Expected unavailable-plan submit callback");
    }
    await act(async () => {
      await onPress();
    });

    expect(setErrorMock).toHaveBeenCalledWith(
      "root",
      expect.objectContaining({ message: "Activity plan is unavailable" }),
    );
    expect(createMutateAsyncMock).not.toHaveBeenCalled();
  });

  it("shows existing executable events as read-only", async () => {
    existingActivityData = {
      id: "event-1",
      scheduled_date: "2026-03-23",
      starts_at: "2026-03-23T09:00:00.000Z",
      all_day: false,
      notes: "Bring gels",
      activityPlanSummary: createActivityPlanDetail(),
    };

    await renderNative(<ScheduleActivityModal visible onClose={jest.fn()} eventId="event-1" />);

    expect(screen.getByText("This event is read-only on mobile")).toBeTruthy();
    expect(screen.queryByTestId("schedule-submit-button")).toBeNull();
    expect(updateMutateMock).not.toHaveBeenCalled();
  });

  it("does not expose update controls or mutate for a top-level plan ID with a null relation", async () => {
    existingActivityData = {
      id: "event-1",
      scheduled_date: "2026-03-23",
      starts_at: "2026-03-23T09:00:00.000Z",
      all_day: false,
      notes: "Bring gels",
      activity_plan_id: "plan-1",
      activityPlanSummary: null,
    };

    await renderNative(<ScheduleActivityModal visible onClose={jest.fn()} eventId="event-1" />);

    expect(screen.getByText("This event is read-only on mobile")).toBeTruthy();
    expect(screen.queryByTestId("schedule-submit-button")).toBeNull();
    expect(screen.queryByTestId("scheduled-date-button")).toBeNull();
    expect(screen.queryByTestId("schedule-edit-scope-single")).toBeNull();
    expect(updateMutateMock).not.toHaveBeenCalled();
  });
});
