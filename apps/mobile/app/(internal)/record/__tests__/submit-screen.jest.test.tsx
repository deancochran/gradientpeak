import type React from "react";
import { Alert } from "react-native";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const replace = jest.fn();
const cleanup = jest.fn(async () => undefined);
const clearArtifact = jest.fn(async () => undefined);
let hookCalls = 0;

jest.mock("react-native", () => ({
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
  KeyboardAvoidingView: createHost("KeyboardAvoidingView"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ replace }) }));
jest.mock("@repo/ui/components/button", () => ({ Button: createHost("Pressable") }));
jest.mock("@repo/ui/components/form", () => ({
  Form: createHost("Form"),
  FormTextField: createHost("FormTextField"),
  FormTextareaField: createHost("FormTextareaField"),
  FormSegmentedSelectField: createHost("FormSegmentedSelectField"),
}));
jest.mock("@repo/ui/components/icon", () => ({ Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/loading", () => ({ LoadingButton: createHost("Pressable") }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@repo/ui/hooks", () => ({
  useZodForm: () => ({ watch: () => "", reset: jest.fn(), control: {} }),
  useZodFormSubmit: () => ({
    handleSubmit: jest.fn(),
    getSubmitButtonState: () => ({ disabled: true, loading: false, label: "Save Activity" }),
  }),
}));
jest.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
  ScreenErrorFallback: createHost("Fallback"),
}));
jest.mock("@/lib/providers/ActivityRecorderProvider", () => ({
  useSharedActivityRecorder: () => ({ cleanup }),
}));
jest.mock("@/lib/hooks/useActivitySubmission", () => ({
  useActivitySubmission: () => {
    hookCalls += 1;
    return {
      activity: null,
      artifact: null,
      error: "No finalized activity artifact found",
      isLoading: false,
      isSubmitting: false,
      update: jest.fn(),
      submit: jest.fn(),
    };
  },
}));
jest.mock("@/lib/services/ActivityRecorder/finalizedArtifactStorage", () => ({
  clearPendingFinalizedArtifact: clearArtifact,
  deleteFinalizedArtifactFiles: jest.fn(async () => undefined),
}));
jest.mock("lucide-react-native", () => ({
  Save: createHost("Save"),
  Trash2: createHost("Trash2"),
}));

const Submit = require("../submit").default;

it("retries loading by remounting submission recovery", () => {
  renderNative(<Submit />);
  fireEvent.press(screen.getByTestId("activity-submit-retry-load"));
  expect(hookCalls).toBe(2);
});

it("safely clears the missing artifact and exits after confirmation", async () => {
  renderNative(<Submit />);
  fireEvent.press(screen.getByTestId("activity-submit-discard-exit"));
  const destructive = (Alert.alert as jest.Mock).mock.calls[0][2][1];
  await destructive.onPress();
  expect(clearArtifact).toHaveBeenCalled();
  expect(cleanup).toHaveBeenCalled();
  expect(replace).toHaveBeenCalledWith("/(internal)/(tabs)");
});
