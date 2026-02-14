import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import {
  SinglePageForm,
  type TrainingPlanConfigFormData,
  type TrainingPlanFormData,
} from "../SinglePageForm";

vi.mock("react-native", () => ({
  Modal: (props: any) => React.createElement("Modal", props, props.children),
  Pressable: (props: any) =>
    React.createElement("Pressable", props, props.children),
  ScrollView: (props: any) =>
    React.createElement("ScrollView", props, props.children),
  View: (props: any) => React.createElement("View", props, props.children),
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: (props: any) => React.createElement("Button", props, props.children),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: (props: any) => React.createElement("Badge", props, props.children),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => React.createElement("Input", props),
}));

vi.mock("@/components/ui/label", () => ({
  Label: (props: any) => React.createElement("Label", props, props.children),
}));

vi.mock("@/components/ui/text", () => ({
  Text: (props: any) => React.createElement("Text", props, props.children),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: (props: any) => React.createElement("Switch", props),
}));

vi.mock("@/components/ui/select", () => ({
  Select: (props: any) => React.createElement("Select", props, props.children),
  SelectContent: (props: any) =>
    React.createElement("SelectContent", props, props.children),
  SelectItem: (props: any) =>
    React.createElement("SelectItem", props, props.children),
  SelectTrigger: (props: any) =>
    React.createElement("SelectTrigger", props, props.children),
  SelectValue: (props: any) => React.createElement("SelectValue", props),
}));

vi.mock("../CreationProjectionChart", () => ({
  CreationProjectionChart: (props: any) =>
    React.createElement("CreationProjectionChart", props),
}));

vi.mock("../inputs/BoundedNumberInput", () => ({
  BoundedNumberInput: (props: any) =>
    React.createElement("BoundedNumberInput", props),
}));

vi.mock("../inputs/DateField", () => ({
  DateField: (props: any) => React.createElement("DateField", props),
}));

vi.mock("../inputs/DurationInput", () => ({
  DurationInput: (props: any) => React.createElement("DurationInput", props),
}));

vi.mock("../inputs/IntegerStepper", () => ({
  IntegerStepper: (props: any) => React.createElement("IntegerStepper", props),
}));

vi.mock("../inputs/PaceInput", () => ({
  PaceInput: (props: any) => React.createElement("PaceInput", props),
}));

vi.mock("../inputs/PercentSliderInput", () => ({
  PercentSliderInput: (props: any) =>
    React.createElement("PercentSliderInput", props),
}));

vi.mock("lucide-react-native", () => {
  const icon = (props: any) => React.createElement("Icon", props);
  return {
    ChevronDown: icon,
    ChevronUp: icon,
    Lock: icon,
    LockOpen: icon,
    Pencil: icon,
    Plus: icon,
    ShieldAlert: icon,
    Trash2: icon,
  };
});

const getNodeText = (children: any): string => {
  if (typeof children === "string") {
    return children;
  }

  if (typeof children === "number") {
    return String(children);
  }

  if (Array.isArray(children)) {
    return children.map((child) => getNodeText(child)).join("");
  }

  if (children?.props?.children !== undefined) {
    return getNodeText(children.props.children);
  }

  return "";
};

const findMockNodes = (renderer: ReactTestRenderer, type: string) =>
  renderer.root.findAll((node: any) => node.type === type);

const baseFormData: TrainingPlanFormData = {
  planStartDate: "2026-02-14",
  goals: [
    {
      id: "goal-1",
      name: "Spring race",
      targetDate: "2026-06-01",
      priority: 1,
      targets: [
        {
          id: "target-1",
          targetType: "race_performance",
          activityCategory: "run",
        },
      ],
    },
  ],
};

const baseConfigData = {
  availabilityConfig: {
    template: "moderate",
    days: [
      { day: "monday", windows: [], max_sessions: 0 },
      { day: "tuesday", windows: [], max_sessions: 0 },
      { day: "wednesday", windows: [], max_sessions: 0 },
      { day: "thursday", windows: [], max_sessions: 0 },
      { day: "friday", windows: [], max_sessions: 0 },
      { day: "saturday", windows: [], max_sessions: 0 },
      { day: "sunday", windows: [], max_sessions: 0 },
    ],
  },
  availabilityProvenance: {
    source: "default",
    updated_at: "2026-02-13T00:00:00.000Z",
  },
  recentInfluenceScore: 0,
  recentInfluenceAction: "accepted",
  recentInfluenceProvenance: {
    source: "default",
    updated_at: "2026-02-13T00:00:00.000Z",
  },
  constraints: {
    hard_rest_days: [],
    min_sessions_per_week: 3,
    max_sessions_per_week: 5,
  },
  optimizationProfile: "balanced",
  postGoalRecoveryDays: 5,
  maxWeeklyTssRampPct: 8,
  maxCtlRampPerWeek: 4,
  constraintsSource: "default",
  locks: {
    availability_config: { locked: false },
    recent_influence: { locked: false },
    constraints: { locked: false },
  },
} as unknown as TrainingPlanConfigFormData;

describe("SinglePageForm blocker surfacing", () => {
  it("shows create-disabled reason and blocking conflicts on review tab", () => {
    const onResolveConflict = vi.fn();

    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SinglePageForm
          formData={baseFormData}
          onFormDataChange={vi.fn()}
          configData={baseConfigData}
          onConfigChange={vi.fn()}
          onResolveConflict={onResolveConflict}
          createDisabledReason="Create is disabled until blockers are resolved."
          blockingIssues={[
            {
              code: "required_tss_ramp_exceeds_cap",
              message: "Required weekly load exceeds cap",
              suggestions: ["Lower target ramp"],
            },
            {
              code: "min_sessions_exceeds_max",
              message: "Min sessions exceeds max sessions",
              suggestions: ["Raise max sessions"],
            },
          ]}
        />,
      );
    });

    const reviewTab = renderer!.root.find(
      (node: any) => node.props.accessibilityLabel === "Review tab",
    );

    act(() => {
      reviewTab.props.onPress();
    });

    const textNodes = findMockNodes(renderer!, "Text").map((node: any) =>
      getNodeText(node.props.children),
    );

    expect(textNodes).toContain(
      "Create is disabled until blockers are resolved.",
    );
    expect(textNodes).toContain("Resolve blocking conflicts");
    expect(textNodes).toContain("Required weekly load exceeds cap");
    expect(textNodes).toContain("Min sessions exceeds max sessions");

    const quickFixButton = findMockNodes(renderer!, "Button").find(
      (node: any) =>
        getNodeText(node.props.children).includes("Apply quick fix"),
    );

    act(() => {
      quickFixButton?.props.onPress();
    });

    expect(onResolveConflict).toHaveBeenCalledWith(
      "required_tss_ramp_exceeds_cap",
    );
  });
});
