import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type React from "react";
import { createHost, createPressableHost } from "../../../../test/mock-components";
import { act, renderNative, screen } from "../../../../test/render-native";

const submit = jest.fn();
let submissionState: Record<string, unknown>;

jest.mock("react-native", () => ({
  ...(jest.requireActual("@repo/ui/test/react-native") as Record<string, unknown>),
  Alert: { alert: jest.fn() },
  KeyboardAvoidingView: createHost("KeyboardAvoidingView"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useNavigation: () => ({ dispatch: jest.fn() }),
}));
jest.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ profile: { id: "profile-1" } }) }));
jest.mock("@repo/ui/components/button", () => ({ Button: createHost("Pressable") }));
jest.mock("@repo/ui/components/icon", () => ({ Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/loading", () => ({ LoadingButton: createPressableHost() }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
  ScreenErrorFallback: createHost("Fallback"),
}));
jest.mock("@/components/recording/RecordingReviewSummary", () => ({
  RecordingReviewSummary: createHost("RecordingReviewSummary"),
}));
jest.mock("@/lib/providers/ActivityRecorderProvider", () => ({
  useActivityRecorderService: () => ({ service: null }),
}));
jest.mock("@/lib/hooks/useActivitySubmission", () => ({
  useActivitySubmission: () => submissionState,
}));
jest.mock("lucide-react-native", () => ({
  Save: createHost("Save"),
  Trash2: createHost("Trash2"),
}));

const Submit = require("../submit").default as React.ComponentType;

describe("record finalized screen outcomes", () => {
  beforeEach(() => {
    submit.mockClear();
    submissionState = {
      activity: {
        activityCategory: "bike",
        calories: 420,
        content_visibility: "private",
        distanceMeters: 10_200,
        durationSeconds: 1_200,
        movingSeconds: 1_180,
        notes: null,
      },
      artifact: {
        sessionId: "artifact-1",
        profileId: "profile-1",
        finalStats: { manualLapsMs: [] },
      },
      canRetryIngestion: false,
      ingestionId: null,
      isError: true,
      isLoading: false,
      isSubmitting: false,
      statusMessage: "Activity upload failed. Checking whether it can be retried.",
      submit,
      update: jest.fn(),
    };
  });

  it("keeps a failed saved submission available through the current Save Activity action", async () => {
    await renderNative(<Submit />);

    const action = screen.getAllByText("Save Activity").at(-1);
    if (!action) throw new Error("Save Activity action was not rendered");
    let actionHost = action;
    while (actionHost.parent && actionHost.props.disabled === undefined) {
      actionHost = actionHost.parent;
    }
    expect(action).toBeTruthy();
    expect(actionHost.props.disabled).toBe(false);

    await act(async () => {
      await (actionHost.props.onPress as () => unknown)();
    });
    expect(submit).toHaveBeenCalledWith({
      content_visibility: "private",
      name: "Activity",
      notes: null,
    });
  });
});
