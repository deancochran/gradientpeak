import { zodResolver } from "@hookform/resolvers/zod";
import React from "react";
import { FormProvider, useController, useForm } from "react-hook-form";
import { z } from "zod";
import { renderNative, waitFor } from "../../../../test/render-native";

const getNodeText = (children: any): string => {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(getNodeText).join("");
  if (children?.props?.children !== undefined) return getNodeText(children.props.children);
  return "";
};

const findMockNodes = (rendered: ReturnType<typeof renderNative>, type: string) => {
  try {
    return (rendered as any).UNSAFE_getAllByType(type);
  } catch {
    return [];
  }
};

let useZodFormCallCount = 0;

jest.mock("@repo/ui/hooks", () => ({
  __esModule: true,
  useZodForm: ({ schema, defaultValues, mode, reValidateMode }: any) => {
    useZodFormCallCount += 1;
    const resolvedDefaults =
      useZodFormCallCount === 2 ? { name: "", description: "" } : defaultValues;

    return useForm({
      resolver: zodResolver(schema),
      defaultValues: resolvedDefaults,
      mode,
      reValidateMode,
    });
  },
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../../../packages/ui/src/test/react-native"),
  Alert: { alert: jest.fn() },
  KeyboardAvoidingView: (props: any) =>
    React.createElement("KeyboardAvoidingView", props, props.children),
  Modal: (props: any) => React.createElement("Modal", props, props.children),
  Pressable: (props: any) => React.createElement("Pressable", props, props.children),
  ScrollView: (props: any) => React.createElement("ScrollView", props, props.children),
  View: (props: any) => React.createElement("View", props, props.children),
  ActivityIndicator: (props: any) => React.createElement("ActivityIndicator", props),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: (props: any) => React.createElement("StackScreen", props),
  },
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  buildPreviewMinimalPlanFromForm: jest.fn(() => null),
  getTopBlockingIssues: jest.fn(() => []),
  reducePreviewState: jest.fn((previous: any, next: any) => ({ ...previous, ...next })),
  trainingPlanCalibrationConfigSchema: { parse: jest.fn(() => ({})) },
  trainingPlanFormSchema: z.object({
    planStartDate: z.string().optional(),
    goals: z.array(z.any()),
  }),
  createEmptyGoalDraft: () => ({ targets: [] }),
  parseNumberOrUndefined: (value: unknown) => {
    if (value === "" || value === null || value === undefined) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  },
}));

jest.mock("@repo/ui/components/form", () => {
  const React = require("react");
  const { FormProvider, useController } = require("react-hook-form");
  return {
    __esModule: true,
    Form: ({ children, ...form }: any) => React.createElement(FormProvider, form, children),
    FormTextField: ({ control, name, label, testId, maxLength, placeholder }: any) => {
      const { field, fieldState } = useController({ control, name });
      return React.createElement(
        React.Fragment,
        null,
        React.createElement("Input", {
          accessibilityLabel: label,
          testID: testId,
          value: field.value ?? "",
          onChangeText: field.onChange,
          maxLength,
          placeholder,
        }),
        fieldState.error?.message
          ? React.createElement("Text", null, fieldState.error.message)
          : null,
      );
    },
    FormTextareaField: ({ control, name, label, testId, maxLength, placeholder }: any) => {
      const { field, fieldState } = useController({ control, name });
      return React.createElement(
        React.Fragment,
        null,
        React.createElement("Textarea", {
          accessibilityLabel: label,
          testID: testId,
          value: field.value ?? "",
          onChangeText: field.onChange,
          maxLength,
          placeholder,
        }),
        fieldState.error?.message
          ? React.createElement("Text", null, fieldState.error.message)
          : null,
      );
    },
  };
});

jest.mock("@repo/ui/components/badge", () => ({
  __esModule: true,
  Badge: (props: any) => React.createElement("Badge", props, props.children),
}));
jest.mock("@repo/ui/components/bounded-number-input", () => ({
  __esModule: true,
  BoundedNumberInput: (props: any) => React.createElement("BoundedNumberInput", props),
}));
jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: (props: any) => React.createElement("Button", props, props.children),
}));
jest.mock("@repo/ui/components/date-input", () => ({
  __esModule: true,
  DateInput: (props: any) => React.createElement("DateField", props),
}));
jest.mock("@repo/ui/components/duration-input", () => ({
  __esModule: true,
  DurationInput: (props: any) => React.createElement("DurationInput", props),
}));
jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: (props: any) => React.createElement("Icon", props, props.children),
}));
jest.mock("@repo/ui/components/input", () => ({
  __esModule: true,
  Input: (props: any) => React.createElement("Input", props),
}));
jest.mock("@repo/ui/components/number-slider-input", () => ({
  __esModule: true,
  NumberSliderInput: (props: any) => React.createElement("NumberSliderInput", props),
}));
jest.mock("@repo/ui/components/percent-slider-input", () => ({
  __esModule: true,
  PercentSliderInput: (props: any) => React.createElement("PercentSliderInput", props),
}));
jest.mock("@repo/ui/components/select", () => ({
  __esModule: true,
  Select: (props: any) => React.createElement("Select", props, props.children),
  SelectContent: (props: any) => React.createElement("SelectContent", props, props.children),
  SelectItem: (props: any) => React.createElement("SelectItem", props, props.children),
  SelectTrigger: (props: any) => React.createElement("SelectTrigger", props, props.children),
  SelectValue: (props: any) => React.createElement("SelectValue", props),
}));
jest.mock("@repo/ui/components/switch", () => ({
  __esModule: true,
  Switch: (props: any) => React.createElement("Switch", props),
}));
jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: (props: any) => React.createElement("Text", props, props.children),
}));
jest.mock("@repo/ui/components/textarea", () => ({
  __esModule: true,
  Textarea: (props: any) => React.createElement("Textarea", props),
}));

jest.mock("lucide-react-native", () => {
  const icon = (props: any) => React.createElement("Icon", props);
  return {
    __esModule: true,
    Flag: icon,
    Plus: icon,
    ShieldAlert: icon,
    Trash2: icon,
    Trophy: icon,
    X: icon,
  };
});

jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: (props: any) => React.createElement("Svg", props, props.children),
  Circle: (props: any) => React.createElement("Circle", props),
}));

jest.mock("../BehaviorControlsConfigSection", () => ({
  __esModule: true,
  BehaviorControlsConfigSection: (props: any) =>
    React.createElement("BehaviorControlsConfigSection", props),
}));
jest.mock("../ConstraintsConfigSection", () => ({
  __esModule: true,
  ConstraintsConfigSection: (props: any) => React.createElement("ConstraintsConfigSection", props),
}));
jest.mock("../CreationProjectionChart", () => ({
  __esModule: true,
  CreationProjectionChart: (props: any) => React.createElement("CreationProjectionChart", props),
}));
jest.mock("../GoalTargetEditorModal", () => ({
  __esModule: true,
  GoalTargetEditorModal: (props: any) => React.createElement("GoalTargetEditorModal", props),
}));
jest.mock("../GoalTargetsSection", () => ({
  __esModule: true,
  GoalTargetsSection: (props: any) => React.createElement("GoalTargetsSection", props),
}));

jest.mock("@/lib/constants/features", () => ({
  __esModule: true,
  featureFlags: {
    trainingPlanCreateConfigMvp: false,
  },
}));

jest.mock("@/lib/constants/routes", () => ({
  __esModule: true,
  ROUTES: {
    PLAN: {
      TRAINING_PLAN: {
        DETAIL: (id: string) => `/training-plan/${id}`,
      },
    },
  },
}));

jest.mock("@/lib/hooks/useReliableMutation", () => ({
  __esModule: true,
  useReliableMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/lib/training-plan-form/adapters", () => ({
  __esModule: true,
  buildMinimalTrainingPlanPayload: jest.fn(),
  toCreationNormalizationInput: jest.fn(),
  toTrainingPlanConfigFormDataFromStructure: jest.fn(() => ({
    availabilityConfig: { template: "moderate", days: [] },
    availabilityProvenance: { source: "default", updated_at: "2026-02-13T00:00:00.000Z" },
    recentInfluenceScore: 0,
    recentInfluenceAction: "accepted",
    recentInfluenceProvenance: { source: "default", updated_at: "2026-02-13T00:00:00.000Z" },
    constraints: { hard_rest_days: [], min_sessions_per_week: 3, max_sessions_per_week: 5 },
    optimizationProfile: "balanced",
    postGoalRecoveryDays: 5,
    behaviorControlsV1: {
      aggressiveness: 0.5,
      variability: 0.5,
      spike_frequency: 0.35,
      shape_target: 0,
      shape_strength: 0.35,
      recovery_priority: 0.6,
      starting_fitness_confidence: 0.6,
    },
    calibration: {},
    calibrationCompositeLocks: {},
    constraintsSource: "default",
    locks: {
      availability_config: { locked: false },
      recent_influence: { locked: false },
      hard_rest_days: { locked: false },
      min_sessions_per_week: { locked: false },
      max_sessions_per_week: { locked: false },
      max_single_session_duration_minutes: { locked: false },
      goal_difficulty_preference: { locked: false },
      optimization_profile: { locked: false },
      post_goal_recovery_days: { locked: false },
      behavior_controls_v1: { locked: false },
    },
  })),
  toTrainingPlanFormDataFromStructure: jest.fn(() => ({ planStartDate: undefined, goals: [] })),
}));

jest.mock("@/lib/training-plan-form/behaviorControlsState", () => ({
  __esModule: true,
  hasBehaviorControlsChanged: jest.fn(() => false),
  shouldApplyBehaviorControlSuggestions: jest.fn(() => false),
}));

jest.mock("@/lib/training-plan-form/localPreview", () => ({
  __esModule: true,
  computeLocalCreationPreview: jest.fn(),
}));

jest.mock("@/lib/training-plan-form/previewRequestState", () => ({
  __esModule: true,
  nextPendingPreviewCount: jest.fn(({ pendingCount, delta }) => pendingCount + delta),
  shouldIgnorePreviewResponse: jest.fn(() => false),
}));

jest.mock("@/lib/training-plan-form/saveErrorMapping", () => ({
  __esModule: true,
  mapTrainingPlanSaveError: jest.fn((error) => ({
    action: "alert",
    message: error?.message ?? "Failed",
  })),
}));

const useUtilsMock = {
  client: {
    trainingPlans: {
      getCreationSuggestions: {
        query: jest.fn(),
      },
    },
  },
  trainingPlans: {},
};

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => useUtilsMock,
    trainingPlans: {
      get: {
        useQuery: jest.fn(() => ({ data: undefined, isLoading: false })),
      },
      getCreationSuggestions: {
        useQuery: jest.fn(() => ({ data: undefined, isLoading: false, isFetching: false })),
      },
      createFromCreationConfig: {},
      updateFromCreationConfig: {},
      update: {},
    },
  },
}));

import { TrainingPlanComposerScreen } from "../TrainingPlanComposerScreen";

describe("TrainingPlanComposerScreen metadata validation", () => {
  beforeEach(() => {
    useZodFormCallCount = 0;
  });

  it("shows mount-time metadata validation through the rendered Plan tab", async () => {
    const rendered = renderNative(<TrainingPlanComposerScreen mode="create" />);

    await waitFor(() => {
      const textNodes = findMockNodes(rendered, "Text");
      const allText = textNodes.map((node: any) => getNodeText(node.props.children)).join("\n");

      expect(allText).toContain("Plan name is required.");
      expect(allText).toContain("Needs attention: Plan");
    });
  });
});
