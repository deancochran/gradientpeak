import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";

import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const backMock = jest.fn();
const publishGoalCreationMock = jest.fn();
const submitMock = jest.fn();
let mutationOptions: { onSuccess?: (goal: Record<string, unknown>) => Promise<void> } | undefined;

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  KeyboardAvoidingView: createHost("KeyboardAvoidingView"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) => (
      <>{options?.headerRight?.()}</>
    ),
  },
  useLocalSearchParams: () => ({ returnToTrainingPlanCreate: "1" }),
  useRouter: () => ({ back: backMock, replace: jest.fn() }),
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  buildGoalCreatePayload: jest.fn(),
  canonicalGoalObjectiveSchema: { safeParse: (value: unknown) => ({ data: value, success: true }) },
  createEmptyGoalDraft: () => ({ title: "" }),
}));

jest.mock("@repo/api/react", () => ({ invalidateGoalQueries: jest.fn() }));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({ goals: {} }),
    goals: {
      create: {
        useMutation: (options: typeof mutationOptions) => {
          mutationOptions = options;
          return { isPending: false, mutateAsync: jest.fn() };
        },
      },
    },
  },
}));
jest.mock("@/lib/constants/routes", () => ({ ROUTES: { GOALS: { DETAIL: jest.fn() } } }));
jest.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { profile: { id: string } }) => unknown) =>
    selector({ profile: { id: "profile-1" } }),
}));
jest.mock("@/lib/training-plan-creation/goalCreationHandoff", () => ({
  publishTrainingPlanGoalCreation: publishGoalCreationMock,
}));
jest.mock("@repo/ui/components/loading", () => ({
  __esModule: true,
  LoadingButton: createHost("LoadingButton"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@/components/goals", () => ({
  __esModule: true,
  GoalEditorForm: React.forwardRef((props: Record<string, unknown>, ref) => {
    React.useImperativeHandle(ref, () => ({ submit: submitMock }));
    return React.createElement("GoalEditorForm", { ...props, testID: "goal-editor-form" });
  }),
}));

const GoalCreateScreen = require("../goal-create").default;

describe("goal create route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mutationOptions = undefined;
  });

  it("uses the platform-specific keyboard avoidance structure, one vertical form surface, and a header Create action", () => {
    renderNative(<GoalCreateScreen />);

    expect(screen.getAllByTestId("goal-create-screen")).toHaveLength(1);
    expect(screen.getByTestId("goal-create-screen").props.behavior).toBe("padding");
    expect(readFileSync(path.resolve(__dirname, "..", "goal-create.tsx"), "utf8")).toContain(
      'behavior={Platform.OS === "ios" ? "padding" : "height"}',
    );
    expect(screen.getAllByTestId("goal-create-scroll")).toHaveLength(1);
    expect(screen.getByTestId("goal-editor-form").props.contentSizing).toBe("intrinsic");

    fireEvent.press(screen.getByText("Create"));
    expect(submitMock).toHaveBeenCalledTimes(1);
  });

  it("publishes a created profile goal and returns to the training-plan cockpit", async () => {
    renderNative(<GoalCreateScreen />);

    await mutationOptions?.onSuccess?.({
      activity_category: "run",
      id: "goal-1",
      priority: 10,
      target_date: "2026-10-01",
      target_payload: { type: "completion" },
      title: "Finish a 10K",
    });

    expect(publishGoalCreationMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "goal-1", title: "Finish a 10K" }),
    );
    expect(backMock).toHaveBeenCalledTimes(1);
  });
});
