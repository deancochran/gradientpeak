import React, { act } from "react";
import type { TestInstance as ReactTestInstance } from "test-renderer";
import { createActivityPlanDetail } from "../../test/activity-plan-projection-fixture";
import { createHost, type HostProps } from "../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../test/render-native";

const alertMock = jest.fn();
const plannedSessionCreateMock = jest.fn(async () => undefined);
const updateMutateMock = jest.fn();
const profileId = "11111111-1111-4111-8111-111111111111";
const activityPlanId = "22222222-2222-4222-8222-222222222222";
const variantId = "33333333-3333-4333-8333-333333333333";

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

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("expo-crypto", () => ({
  __esModule: true,
  randomUUID: () => "44444444-4444-4444-8444-444444444444",
}));

jest.mock("@repo/api/client", () => ({
  __esModule: true,
  buildDirectPlannedSessionCreateInput: (input: Record<string, string>) => ({
    profileId: input.profileId,
    session: {
      planningDate: input.planningDate,
      source: { kind: "direct", operationId: input.operationId },
      activityPlanId: input.activityPlanId,
    },
  }),
}));

jest.mock("@repo/api/react", () => ({
  __esModule: true,
  usePlannedSessionMutations: () => ({
    create: { isPending: false, mutateAsync: plannedSessionCreateMock },
  }),
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

  return {
    __esModule: true,
    useZodForm: ({ defaultValues }: { defaultValues: Record<string, unknown> }) => {
      const initialDefaultsRef = React.useRef(defaultValues);
      const [values, setValues] = React.useState(initialDefaultsRef.current);
      const valuesRef = React.useRef(values);

      valuesRef.current = values;

      return React.useMemo(
        () => ({
          control: {},
          getValues: () => valuesRef.current,
          reset: () => setValues(initialDefaultsRef.current),
          setValue: (name: string, value: unknown) =>
            setValues((current: Record<string, unknown>) => ({ ...current, [name]: value })),
          watch: (name: string) => valuesRef.current[name],
        }),
        [],
      );
    },
    useZodFormSubmit: ({
      form,
      onSubmit,
    }: {
      form: { getValues: () => Record<string, unknown> };
      onSubmit: (values: Record<string, unknown>) => unknown;
    }) => ({
      isSubmitting: false,
      handleSubmit: () => onSubmit(form.getValues()),
    }),
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
  refreshScheduleViews: jest.fn(async () => undefined),
}));

jest.mock("@/lib/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ profile: { id: profileId } }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    events: {
      getById: { useQuery: () => ({ data: existingActivityData, isLoading: false }) },
      update: { useMutation: () => ({ isPending: false, error: null, mutate: updateMutateMock }) },
    },
    activityPlans: {
      getById: {
        useQuery: () => ({
          data: {
            detail: createActivityPlanDetail({
              id: activityPlanId,
              name: "Tempo Builder",
              description: "Progressive tempo session with structured intervals.",
            }),
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
    existingActivityData = null;
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

  it("submits the selected variant through the typed planned-session API", async () => {
    await renderNative(
      <ScheduleActivityModal
        visible
        onClose={jest.fn()}
        activityPlanId={activityPlanId}
        preselectedDate="2026-06-02"
        variantId={variantId}
      />,
    );

    await fireEvent.press(screen.getByTestId("schedule-submit-button"));

    expect(plannedSessionCreateMock).toHaveBeenCalledWith({
      profileId,
      session: {
        planningDate: "2026-06-02",
        source: {
          kind: "direct",
          operationId: "44444444-4444-4444-8444-444444444444",
        },
        activityPlanId,
        variantId,
      },
    });
  });

  it("submits edits for an existing planned event", async () => {
    existingActivityData = {
      id: "event-1",
      scheduled_date: "2026-03-23",
      starts_at: "2026-03-23T09:00:00.000Z",
      all_day: false,
      notes: "Bring gels",
      activityPlanSummary: createActivityPlanDetail(),
    };

    await renderNative(<ScheduleActivityModal visible onClose={jest.fn()} eventId="event-1" />);

    expect(screen.getByTestId("scheduled-date-button")).toBeTruthy();

    const buttons = screen.container.queryAll(
      (node: ReactTestInstance) => String(node.type) === "Button",
    );
    const submitButton = buttons.at(-1);
    if (!submitButton) {
      throw new Error("Expected the schedule submit button");
    }

    await act(() => {
      submitButton.props.onPress();
    });

    expect(updateMutateMock).toHaveBeenCalledWith({
      id: "event-1",
      scope: "single",
      patch: expect.objectContaining({
        activity_plan_id: "plan-1",
        notes: "Bring gels",
        scheduled_date: "2026-03-23",
      }),
    });
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
