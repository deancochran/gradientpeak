import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ROUTES } from "@/lib/constants/routes";
import TrainingPlanSettings from "../training-plan-settings";

const pushMock = vi.fn();
const trainingPlanState = vi.hoisted(() => ({
  plan: null as any,
}));

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

vi.mock("react-native", () => ({
  ActivityIndicator: createHost("ActivityIndicator"),
  Alert: { alert: vi.fn() },
  KeyboardAvoidingView: createHost("KeyboardAvoidingView"),
  Platform: { OS: "ios" },
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ trainingPlans: {} }),
    trainingPlans: {
      get: {
        useQuery: () => ({
          data: trainingPlanState.plan,
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
      getCurrentStatus: {
        useQuery: () => ({ data: null }),
      },
    },
  },
}));

vi.mock("@/lib/hooks/useReliableMutation", () => ({
  useReliableMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: (props: any) => React.createElement("Button", props, props.children),
}));

vi.mock("@/components/ui/card", () => ({
  Card: (props: any) => React.createElement("Card", props, props.children),
  CardContent: (props: any) =>
    React.createElement("CardContent", props, props.children),
  CardHeader: (props: any) =>
    React.createElement("CardHeader", props, props.children),
  CardTitle: (props: any) =>
    React.createElement("CardTitle", props, props.children),
}));

vi.mock("@/components/ui/icon", () => ({
  Icon: (props: any) => React.createElement("Icon", props, props.children),
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

vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: any) => React.createElement("Textarea", props),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: (props: any) => React.createElement("Switch", props),
}));

vi.mock("lucide-react-native", () => ({
  AlertCircle: (props: any) => React.createElement("AlertCircle", props),
  Edit3: (props: any) => React.createElement("Edit3", props),
  Save: (props: any) => React.createElement("Save", props),
  Trash2: (props: any) => React.createElement("Trash2", props),
}));

describe("TrainingPlanSettings", () => {
  it("routes no-plan CTA to training plan create", () => {
    trainingPlanState.plan = null;
    pushMock.mockReset();

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TrainingPlanSettings />);
    });

    const createButton = renderer.root.find(
      (node: any) => node.type === "Button",
    );

    act(() => {
      createButton.props.onPress();
    });

    expect(pushMock).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PLAN.CREATE);
  });

  it("keeps lifecycle and structure actions without status duplication", () => {
    trainingPlanState.plan = {
      id: "plan-1",
      name: "Build Phase",
      description: "Progressive overload block",
      created_at: "2026-01-01T00:00:00.000Z",
      is_active: true,
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TrainingPlanSettings />);
    });

    const allText = renderer.root
      .findAll((node: any) => node.type === "Text")
      .map((node: any) => {
        const value = node.props.children;
        return Array.isArray(value) ? value.join("") : String(value ?? "");
      })
      .join("\n");

    const cardTitles = renderer.root
      .findAll((node: any) => node.type === "CardTitle")
      .map((node: any) => {
        const value = node.props.children;
        return Array.isArray(value) ? value.join("") : String(value ?? "");
      })
      .join("\n");

    expect(cardTitles).toContain("Plan Lifecycle");
    expect(cardTitles).toContain("Training Plan Structure");
    expect(allText).toContain("Edit Structure");
    expect(allText).not.toContain("Current Fitness (CTL)");
    expect(allText).not.toContain("Weekly Adherence");

    const switches = renderer.root.findAll(
      (node: any) => node.type === "Switch",
    );
    expect(switches.length).toBeGreaterThan(0);
  });
});
