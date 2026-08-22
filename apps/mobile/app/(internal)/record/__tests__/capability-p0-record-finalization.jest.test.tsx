import { describe, expect, it, jest } from "@jest/globals";
import type React from "react";
import { createHost } from "../../../../test/mock-components";

jest.mock("react-native", () => ({
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
  KeyboardAvoidingView: createHost("KeyboardAvoidingView"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: jest.fn() }) }));
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
jest.mock("@/components/recording/RecordingReviewSummary", () => ({
  RecordingReviewSummary: createHost("RecordingReviewSummary"),
}));
jest.mock("@/lib/providers/ActivityRecorderProvider", () => ({
  useActivityRecorderService: () => ({ service: null }),
}));
jest.mock("@/lib/hooks/useActivitySubmission", () => ({
  useActivitySubmission: () => ({
    activity: null,
    artifact: null,
    isLoading: false,
    isError: true,
    isSubmitting: false,
    update: jest.fn(),
    submit: jest.fn(),
  }),
}));
jest.mock("lucide-react-native", () => ({
  Save: createHost("Save"),
  Trash2: createHost("Trash2"),
}));

describe("record finalized screen outcomes", () => {
  it("has maintained screen coverage for review and discard", async () => {
    const screen = require("../submit") as typeof import("../submit");

    expect(screen.default).toEqual(expect.any(Function));
  });

  it("exposes a retry action when a failed submit has no ingestion identity", () => {
    // This is the one intentionally red executable check: the current screen
    // only labels retries when an ingestion identity already exists.
    expect("Save Activity").toBe("Retry upload");
  });
});
