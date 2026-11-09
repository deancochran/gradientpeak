import type React from "react";
import { Alert } from "react-native";
import { createHost } from "../../../../test/mock-components";
import { act, fireEvent, renderNative, screen } from "../../../../test/render-native";

const replace = jest.fn();
const cleanup = jest.fn(async () => undefined);
const discardFinalizedArtifact = jest.fn(async () => {
  durable.bytes.length = 0;
  durable.queue = null;
});
let hookCalls = 0;
let submissionState: Record<string, unknown>;
const dispatch = jest.fn();
let preventRemove: { enabled: boolean; callback: (event: { data: { action: object } }) => void };
let profileId = "profile-1";
const durable: {
  bytes: number[];
  queue: { id: string; ingestionId: string; status: string } | null;
} = { bytes: [], queue: null };

jest.mock("react-native", () => ({
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
  KeyboardAvoidingView: createHost("KeyboardAvoidingView"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace }),
  useNavigation: () => ({ dispatch }),
}));
jest.mock("expo-router/react-navigation", () => ({
  usePreventRemove: (enabled: boolean, callback: typeof preventRemove.callback) => {
    preventRemove = { enabled, callback };
  },
}));
jest.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ profile: { id: profileId } }) }));
jest.mock("@repo/ui/components/button", () => ({ Button: createHost("Pressable") }));
jest.mock("@repo/ui/components/icon", () => ({ Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/loading", () => ({ LoadingButton: createHost("Pressable") }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
  ScreenErrorFallback: createHost("Fallback"),
}));
jest.mock("@/lib/providers/ActivityRecorderProvider", () => ({
  useActivityRecorderService: () => ({ service: { cleanup, discardFinalizedArtifact } }),
}));
jest.mock("@/lib/hooks/useActivitySubmission", () => ({
  useActivitySubmission: () => {
    hookCalls += 1;
    return submissionState;
  },
}));
jest.mock("lucide-react-native", () => ({
  Save: createHost("Save"),
  Trash2: createHost("Trash2"),
}));

const Submit = require("../submit").default;

beforeEach(() => {
  replace.mockClear();
  cleanup.mockClear();
  discardFinalizedArtifact.mockClear();
  (Alert.alert as jest.Mock).mockClear();
  hookCalls = 0;
  dispatch.mockClear();
  profileId = "profile-1";
  durable.bytes = [1, 2, 3];
  durable.queue = { id: "artifact-1", ingestionId: "ingestion-1", status: "failed" };
  submissionState = {
    activity: null,
    artifact: null,
    error: "No finalized activity artifact found",
    isLoading: false,
    isSubmitting: false,
    update: jest.fn(),
    submit: jest.fn(),
  };
});

it("shows a recorded indoor session summary before saving", async () => {
  submissionState = {
    ...submissionState,
    activity: {
      name: "Private stored recording name",
      activityCategory: "bike",
      durationSeconds: 1200,
      movingSeconds: 1180,
      distanceMeters: 10200,
      calories: 420,
      notes: null,
      content_visibility: "private",
    },
    artifact: { sessionId: "artifact-1", profileId: "profile-1", finalStats: { manualLapsMs: [] } },
  };

  await renderNative(<Submit />);

  expect(screen.getByTestId("recording-review-summary")).toBeTruthy();
  expect(screen.getByText("Review your bike")).toBeTruthy();
  expect(screen.getByText("10.20 km")).toBeTruthy();
});

it("never renders the stored recorded activity name in submission review", async () => {
  submissionState = {
    ...submissionState,
    activity: {
      name: "Private stored recording name",
      notes: null,
      content_visibility: "private",
    },
    artifact: { sessionId: "artifact-1", profileId: "profile-1" },
  };

  await renderNative(<Submit />);

  expect(screen.queryByTestId("activity-name-input")).toBeNull();
  expect(screen.queryByText("Private stored recording name")).toBeNull();
});

it("retries loading by remounting submission recovery", async () => {
  await renderNative(<Submit />);
  expect(screen.queryByTestId("activity-submit-save-bar")).toBeNull();
  await fireEvent.press(screen.getByTestId("activity-submit-retry-load"));
  expect(hookCalls).toBeGreaterThan(1);
});

function ready() {
  submissionState = {
    ...submissionState,
    activity: {
      name: "Activity",
      notes: "Stored notes",
      content_visibility: "private",
      activityCategory: "bike",
    },
    artifact: { sessionId: "artifact-1", profileId: "profile-1", finalStats: { manualLapsMs: [] } },
    submit: jest.fn(async () => false),
  };
}

it("retains edited notes and visibility during same-recording artifact refresh without submitting", async () => {
  ready();
  const view = await renderNative(<Submit />);
  await fireEvent.changeText(screen.getByTestId("activity-notes-input"), "Unsaved notes");
  await fireEvent.press(screen.getByText("Public"));
  submissionState = {
    ...submissionState,
    activity: {
      ...(submissionState.activity as object),
      notes: "Refetched notes",
      content_visibility: "followers",
    },
  };
  await view.rerender(<Submit />);
  expect(screen.getByTestId("activity-notes-input").props.value).toBe("Unsaved notes");
  expect(preventRemove.enabled).toBe(true);
  expect(submissionState.submit).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId("activity-submit-save-button"));
  expect(submissionState.submit).toHaveBeenCalledWith(
    expect.objectContaining({ notes: "Unsaved notes", content_visibility: "public" }),
  );
});

it.each(["recording", "owner"])("resets the draft on a different %s", async (change) => {
  ready();
  const view = await renderNative(<Submit />);
  await fireEvent.changeText(screen.getByTestId("activity-notes-input"), "Old draft");
  if (change === "owner") profileId = "profile-2";
  submissionState = {
    ...submissionState,
    activity: { ...(submissionState.activity as object), notes: "Next recording" },
    artifact: {
      sessionId: change === "recording" ? "artifact-2" : "artifact-1",
      profileId,
      finalStats: {},
    },
  };
  await view.rerender(<Submit />);
  expect(screen.getByTestId("activity-notes-input").props.value).toBe("Next recording");
  expect(preventRemove.enabled).toBe(false);
});

it("Back cancellation retains the draft and allowed navigation preserves finalized bytes and queue", async () => {
  ready();
  const original = JSON.stringify(durable);
  await renderNative(<Submit />);
  await fireEvent.changeText(screen.getByTestId("activity-notes-input"), "Keep these notes");
  await act(async () => preventRemove.callback({ data: { action: { type: "GO_BACK" } } }));
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)[2];
  expect(buttons[0].text).toBe("Keep editing");
  expect(dispatch).not.toHaveBeenCalled();
  expect(screen.getByTestId("activity-notes-input").props.value).toBe("Keep these notes");
  await act(async () => buttons[1].onPress());
  expect(dispatch).toHaveBeenCalledWith({ type: "GO_BACK" });
  expect(discardFinalizedArtifact).not.toHaveBeenCalled();
  expect(cleanup).not.toHaveBeenCalled();
  expect(submissionState.submit).not.toHaveBeenCalled();
  expect(JSON.stringify(durable)).toBe(original);
});

it("blocks Back and duplicate Save during a pending attempt and retains the retry draft", async () => {
  ready();
  let finish!: (value: boolean) => void;
  submissionState.submit = jest.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = await renderNative(<Submit />);
  await fireEvent.changeText(screen.getByTestId("activity-notes-input"), "Retry notes");
  const press = screen.getByTestId("activity-submit-save-button").props.onPress;
  await act(async () => {
    void press();
    void press();
  });
  expect(submissionState.submit).toHaveBeenCalledTimes(1);
  await act(async () => preventRemove.callback({ data: { action: { type: "GO_BACK" } } }));
  expect(dispatch).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenLastCalledWith("Saving changes", expect.any(String));
  await act(async () => finish(false));
  expect(screen.getByTestId("activity-notes-input").props.value).toBe("Retry notes");
  expect(discardFinalizedArtifact).not.toHaveBeenCalled();
  (submissionState.submit as jest.Mock).mockResolvedValueOnce(false);
  submissionState = {
    ...submissionState,
    isError: true,
    canRetryIngestion: true,
    ingestionId: "ingestion-1",
  };
  await view.rerender(<Submit />);
  expect(screen.getByText("Retry upload")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("activity-submit-save-button"));
  const calls = (submissionState.submit as jest.Mock).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(calls[0]);
  expect(durable.queue?.ingestionId).toBe("ingestion-1");
});

it("does not expose or discard an old owner's recording while the next account loads", async () => {
  ready();
  const view = await renderNative(<Submit />);
  await fireEvent.changeText(screen.getByTestId("activity-notes-input"), "Old owner notes");
  profileId = "profile-2";
  await view.rerender(<Submit />);
  expect(screen.queryByTestId("activity-notes-input")).toBeNull();
  expect(screen.getByText(/This recording belongs to another account/)).toBeTruthy();
  await fireEvent.press(screen.getByTestId("activity-submit-discard-exit"));
  expect(discardFinalizedArtifact).not.toHaveBeenCalled();
  expect(submissionState.submit).not.toHaveBeenCalled();
});

it("ignores late submission success after a different recording replaces the screen owner", async () => {
  ready();
  let finish!: (value: boolean) => void;
  submissionState.submit = jest.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = await renderNative(<Submit />);
  await act(async () => {
    void screen.getByTestId("activity-submit-save-button").props.onPress();
  });
  submissionState = {
    ...submissionState,
    activity: { ...(submissionState.activity as object), notes: "Next draft" },
    artifact: { sessionId: "artifact-2", profileId, finalStats: {} },
  };
  await view.rerender(<Submit />);
  await act(async () => finish(true));
  expect(screen.getByTestId("activity-notes-input").props.value).toBe("Next draft");
  expect(cleanup).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
});

it("exits after confirmation when no finalized artifact is available", async () => {
  await renderNative(<Submit />);
  await fireEvent.press(screen.getByTestId("activity-submit-discard-exit"));
  const destructive = (Alert.alert as jest.Mock).mock.calls[0][2][1];
  await destructive.onPress();
  expect(discardFinalizedArtifact).toHaveBeenCalled();
  expect(cleanup).toHaveBeenCalled();
  expect(replace).toHaveBeenCalledWith("/(internal)/(tabs)");
});

it("keeps the discard screen recoverable when the durable discard transition fails", async () => {
  discardFinalizedArtifact.mockRejectedValueOnce(new Error("sqlite unavailable"));
  await renderNative(<Submit />);
  await fireEvent.press(screen.getByTestId("activity-submit-discard-exit"));
  const destructive = (Alert.alert as jest.Mock).mock.calls.at(-1)[2][1];
  await act(async () => {
    await destructive.onPress();
  });
  expect(cleanup).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  expect(screen.getByText("Unable to discard this activity. Please try again.")).toBeTruthy();
});
