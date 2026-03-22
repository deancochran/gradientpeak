import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleActivityModal } from "../ScheduleActivityModal";

vi.mock("@tanstack/react-query", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");

  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

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

const { alertMock } = vi.hoisted(() => ({
  alertMock: vi.fn(),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: createHost("ActivityIndicator"),
  Alert: { alert: alertMock },
  Modal: ({ visible, children, ...props }: any) =>
    visible ? React.createElement("Modal", props, children) : null,
  Pressable: createHost("Pressable"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

vi.mock("@react-native-community/datetimepicker", () => ({
  default: createHost("DateTimePicker"),
}));

vi.mock("@/components/ActivityPlan/TimelineChart", () => ({
  TimelineChart: createHost("TimelineChart"),
}));

vi.mock("./training-plan/modals/components/ConstraintValidator", () => ({
  ConstraintValidator: createHost("ConstraintValidator"),
}));

vi.mock("@repo/ui/components/button", () => ({
  Button: createHost("Button"),
}));

vi.mock("@repo/ui/components/card", () => ({
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));

vi.mock("@repo/ui/components/icon", () => ({
  Icon: createHost("Icon"),
}));

vi.mock("@repo/ui/components/text", () => ({
  Text: createHost("Text"),
}));

vi.mock("@repo/ui/components/textarea", () => ({
  Textarea: createHost("Textarea"),
}));

vi.mock("lucide-react-native", () => ({
  AlertTriangle: createHost("AlertTriangle"),
  Calendar: createHost("Calendar"),
  Check: createHost("Check"),
  ChevronDown: createHost("ChevronDown"),
  ChevronUp: createHost("ChevronUp"),
  Clock: createHost("Clock"),
  TrendingUp: createHost("TrendingUp"),
  X: createHost("X"),
}));

vi.mock("@/lib/scheduling/refreshScheduleViews", () => ({
  refreshScheduleViews: vi.fn(async () => undefined),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    events: {
      getById: {
        useQuery: () => ({ data: null, isLoading: false }),
      },
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
      create: {
        useMutation: () => ({ isPending: false, error: null, mutate: vi.fn() }),
      },
      update: {
        useMutation: () => ({ isPending: false, error: null, mutate: vi.fn() }),
      },
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
  },
}));

describe("ScheduleActivityModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps workout preview and constraint details collapsed by default", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <ScheduleActivityModal
          visible
          onClose={vi.fn()}
          activityPlanId="plan-1"
          trainingPlanId="training-plan-1"
        />,
      );
    });

    expect(renderer.root.findByProps({ testID: "schedule-preview-toggle" })).toBeDefined();
    expect(renderer.root.findByProps({ testID: "schedule-constraints-toggle" })).toBeDefined();
    expect(renderer.root.findAll((node: any) => node.type === "TimelineChart")).toHaveLength(0);
    expect(renderer.root.findAll((node: any) => node.type === "ConstraintValidator")).toHaveLength(
      0,
    );
  });

  it("reveals secondary details only when the disclosure controls are used", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <ScheduleActivityModal
          visible
          onClose={vi.fn()}
          activityPlanId="plan-1"
          trainingPlanId="training-plan-1"
        />,
      );
    });

    act(() => {
      renderer.root.findByProps({ testID: "schedule-preview-toggle" }).props.onPress();
    });

    act(() => {
      renderer.root.findByProps({ testID: "schedule-constraints-toggle" }).props.onPress();
    });

    expect(renderer.root.findByProps({ testID: "schedule-preview-details" })).toBeDefined();
    expect(renderer.root.findByProps({ testID: "schedule-constraints-details" })).toBeDefined();
    expect(renderer.root.findAll((node: any) => node.type === "TimelineChart")).toHaveLength(1);

    const combinedText = renderer.root
      .findAll((node: any) => node.type === "Text")
      .map((node: any) => getTextContent(node.props.children))
      .join(" ");

    expect(combinedText).toContain("Constraint Validation");
  });
});
