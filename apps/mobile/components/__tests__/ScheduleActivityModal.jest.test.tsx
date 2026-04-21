import React, { act } from "react";
import { z } from "zod";

import { fireEvent, renderNative, screen } from "../../test/render-native";

const alertMock = jest.fn();
const createMutateMock = jest.fn();
const updateMutateMock = jest.fn();

let existingActivityData: any = null;

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: alertMock },
  Modal: ({ visible, children, ...props }: any) =>
    visible ? React.createElement("Modal", props, children) : null,
}));

jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: createHost("DateTimePicker"),
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  plannedActivityScheduleFormSchema: z.object({
    activity_plan_id: z.string().optional(),
    scheduled_date: z.string().optional(),
    notes: z.string().nullable().optional(),
    training_plan_id: z.string().nullable().optional(),
  }),
}));

jest.mock("@repo/ui/hooks", () => {
  const React = require("react");

  return {
    __esModule: true,
    useZodForm: ({ defaultValues }: any) => {
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
    useZodFormSubmit: ({ form, onSubmit }: any) => ({
      isSubmitting: false,
      handleSubmit: () => onSubmit(form.getValues()),
    }),
  };
});

jest.mock("@/components/ActivityPlan/TimelineChart", () => ({
  __esModule: true,
  TimelineChart: createHost("TimelineChart"),
}));

jest.mock("@/components/activity-plan/ActivityPlanContentPreview", () => ({
  __esModule: true,
  ActivityPlanContentPreview: createHost("ActivityPlanContentPreview"),
}));

jest.mock("../training-plan/modals/components/ConstraintValidator", () => ({
  __esModule: true,
  ConstraintValidator: () => React.createElement("Text", {}, "Constraint Validation"),
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
  FormDateInputField: createHost("FormDateInputField"),
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

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    events: {
      getById: { useQuery: () => ({ data: existingActivityData, isLoading: false }) },
      validateConstraints: {
        useQuery: () => ({
          data: {
            canSchedule: false,
            hasWarnings: false,
            constraints: {
              weeklyTSS: { status: "violated", current: 200, withNew: 320, limit: 280 },
              activitiesPerWeek: { status: "ok", current: 3, withNew: 4, limit: 5 },
              consecutiveDays: { status: "warning", current: 2, withNew: 3, limit: 3 },
              restDays: { status: "warning", current: 1, withNew: 0, minimum: 1 },
            },
          },
          isLoading: false,
          error: null,
        }),
      },
      create: { useMutation: () => ({ isPending: false, error: null, mutate: createMutateMock }) },
      update: { useMutation: () => ({ isPending: false, error: null, mutate: updateMutateMock }) },
    },
    activityPlans: {
      getById: {
        useQuery: () => ({
          data: {
            id: "plan-1",
            name: "Tempo Builder",
            description: "Progressive tempo session with structured intervals.",
            activity_category: "outdoor_run",
            estimated_duration: 3600,
            estimated_tss: 72,
            structure: { intervals: [{ id: "step-1" }] },
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

  it("shows the activity preview immediately and keeps constraints collapsed by default", () => {
    const rendered = renderNative(
      <ScheduleActivityModal
        visible
        onClose={jest.fn()}
        activityPlanId="plan-1"
        trainingPlanId="training-plan-1"
      />,
    );

    expect(screen.getByTestId("schedule-constraints-toggle")).toBeTruthy();
    expect(screen.getByTestId("schedule-preview-details")).toBeTruthy();
    expect(screen.queryByTestId("schedule-constraints-details")).toBeNull();
    expect((rendered as any).UNSAFE_getByType("ActivityPlanContentPreview").props.size).toBe(
      "medium",
    );
  });

  it("reveals constraint details only when the disclosure control is used", () => {
    renderNative(
      <ScheduleActivityModal
        visible
        onClose={jest.fn()}
        activityPlanId="plan-1"
        trainingPlanId="training-plan-1"
      />,
    );

    fireEvent.press(screen.getByTestId("schedule-constraints-toggle"));

    expect(screen.getByTestId("schedule-preview-details")).toBeTruthy();
    expect(screen.getByTestId("schedule-constraints-details")).toBeTruthy();
    expect(screen.getByText("Constraint Validation")).toBeTruthy();
  });

  it("supports editing planned-event date, time, and all-day state", () => {
    existingActivityData = {
      id: "event-1",
      scheduled_date: "2026-03-23",
      starts_at: "2026-03-23T09:00:00.000Z",
      all_day: false,
      notes: "Bring gels",
      activity_plan: {
        id: "plan-1",
      },
    };

    renderNative(<ScheduleActivityModal visible onClose={jest.fn()} eventId="event-1" />);

    expect(screen.getByTestId("scheduled-date-button")).toBeTruthy();
    expect(screen.getByTestId("scheduled-time-button")).toBeTruthy();

    const getSwitch = () => (screen as any).UNSAFE_getByType("Switch");

    act(() => {
      getSwitch().props.onCheckedChange(true);
    });

    expect(screen.queryByTestId("scheduled-time-button")).toBeNull();

    act(() => {
      getSwitch().props.onCheckedChange(false);
      fireEvent.press(screen.getByTestId("scheduled-date-button"));
    });

    const datePicker = (screen as any).UNSAFE_getByType("DateTimePicker");

    act(() => {
      datePicker.props.onChange({}, new Date("2026-03-24T12:00:00.000Z"));
      fireEvent.press(screen.getByTestId("scheduled-time-button"));
    });

    const timePicker = (screen as any).UNSAFE_getByType("DateTimePicker");

    act(() => {
      timePicker.props.onChange({}, new Date("2026-03-24T14:45:00.000Z"));
    });

    const buttons = (screen as any).UNSAFE_getAllByType("Button");

    act(() => {
      buttons[buttons.length - 1].props.onPress();
    });

    expect(updateMutateMock).toHaveBeenCalledWith({
      id: "event-1",
      scope: "single",
      patch: expect.objectContaining({
        activity_plan_id: "plan-1",
        all_day: false,
        timezone: "UTC",
        starts_at: "2026-03-24T14:45:00.000Z",
      }),
    });
  });
});
