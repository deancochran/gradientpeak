import { Text } from "@repo/ui/components/text";
import { act, render, screen, waitFor } from "@testing-library/react-native";

const checkpoint = {
  sessionId: "profile-1:session",
  profileId: "profile-1",
  lifecycle: "recording",
};

jest.mock("react-native", () => ({
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
}));
jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));
jest.mock("../services/mobileRecordingStartup", () => ({
  prepareMobileRecordingStartup: jest.fn(async () => ({
    checkpoint: {
      status: "recovered",
      checkpoint: {
        sessionId: "profile-1:session",
        profileId: "profile-1",
        lifecycle: "recording",
      },
    },
    queueJobs: [],
    hasQuarantinedEvidence: false,
  })),
}));
jest.mock("../services/ActivityRecorder/checkpointStorage", () => ({
  loadAndClaimRecordingCheckpoint: jest.fn(async () => ({
    status: "recovered",
    checkpoint: { sessionId: "profile-1:session", profileId: "profile-1", lifecycle: "recording" },
  })),
  quarantineActiveRecordingCheckpoint: jest.fn(async () => undefined),
  releaseRecordingCheckpointClaim: jest.fn(),
}));
jest.mock("../services/ActivityRecorder", () => {
  const service = {
    hasConfiguredRecordingSetup: false,
    stageRecoveredCheckpoint: jest.fn(async () => undefined),
    retryRecoveredFinalization: jest.fn(async () => undefined),
    resumeRecoveredRecording: jest.fn(async () => undefined),
    discardRecoveredRecording: jest.fn(async () => undefined),
    cleanup: jest.fn(async () => undefined),
  };
  return { __service: service, ActivityRecorderService: jest.fn(() => service) };
});

import { ActivityRecorderProvider, useRecordingRecovery } from "./ActivityRecorderProvider";

const alertMock = (jest.requireMock("react-native") as { Alert: { alert: jest.Mock } }).Alert.alert;
const replaceMock = (jest.requireMock("expo-router") as { router: { replace: jest.Mock } }).router
  .replace;
const serviceMock = (
  jest.requireMock("../services/ActivityRecorder") as {
    __service: {
      cleanup: jest.Mock;
      stageRecoveredCheckpoint: jest.Mock;
      resumeRecoveredRecording: jest.Mock;
      retryRecoveredFinalization: jest.Mock;
      discardRecoveredRecording: jest.Mock;
    };
  }
).__service;
const recorderConstructorMock = (
  jest.requireMock("../services/ActivityRecorder") as {
    ActivityRecorderService: jest.Mock;
  }
).ActivityRecorderService;
const checkpointMocks = jest.requireMock("../services/ActivityRecorder/checkpointStorage") as {
  quarantineActiveRecordingCheckpoint: jest.Mock;
  releaseRecordingCheckpointClaim: jest.Mock;
};
const startupMocks = jest.requireMock("../services/mobileRecordingStartup") as {
  prepareMobileRecordingStartup: jest.Mock;
};

function RecoveryStatus() {
  const { isRecoveryAvailable } = useRecordingRecovery();
  return <Text>{isRecoveryAvailable ? "Recovery available" : "No recovery"}</Text>;
}

let recoveryCommands: ReturnType<typeof useRecordingRecovery> | null = null;

function RecoveryCommandProbe() {
  recoveryCommands = useRecordingRecovery();
  return <Text>{recoveryCommands.isRecoveryAvailable ? "Recovery available" : "No recovery"}</Text>;
}

function pressLatestAlertButton(text: string) {
  const buttons: Array<{ text: string; onPress: () => void }> | undefined =
    alertMock.mock.calls.at(-1)?.[2];
  buttons?.find((button) => button.text === text)?.onPress();
}

describe("ActivityRecorderProvider recovery prompt", () => {
  beforeEach(() => {
    recoveryCommands = null;
    jest.clearAllMocks();
  });

  it("stages the single owner and resumes through the user prompt", async () => {
    render(
      <ActivityRecorderProvider profile={{ id: "profile-1" }}>
        <Text>child</Text>
      </ActivityRecorderProvider>,
    );
    await waitFor(() =>
      expect(serviceMock.stageRecoveredCheckpoint).toHaveBeenCalledWith(checkpoint),
    );
    await waitFor(() =>
      expect(alertMock).toHaveBeenCalledWith(
        "Resume recording?",
        expect.any(String),
        expect.any(Array),
        { cancelable: false },
      ),
    );
    const buttons = alertMock.mock.calls.at(-1)?.[2] as Array<{
      text: string;
      onPress: () => void;
    }>;
    await act(async () => buttons.find((button) => button.text === "Resume")?.onPress());
    await waitFor(() => expect(serviceMock.resumeRecoveredRecording).toHaveBeenCalledTimes(1));
    expect(replaceMock).toHaveBeenCalledWith("/record");
  });

  it("retries an interrupted finish without resuming live recording", async () => {
    startupMocks.prepareMobileRecordingStartup.mockResolvedValueOnce({
      checkpoint: { status: "recovered", checkpoint: { ...checkpoint, lifecycle: "finishing" } },
      queueJobs: [],
      hasQuarantinedEvidence: false,
    });
    (
      jest.requireMock("../services/ActivityRecorder/checkpointStorage") as {
        loadAndClaimRecordingCheckpoint: jest.Mock;
      }
    ).loadAndClaimRecordingCheckpoint.mockResolvedValueOnce({
      status: "recovered",
      checkpoint: { ...checkpoint, lifecycle: "finishing" },
    });

    render(
      <ActivityRecorderProvider profile={{ id: "profile-1" }}>
        <Text>child</Text>
      </ActivityRecorderProvider>,
    );

    await waitFor(() =>
      expect(alertMock).toHaveBeenCalledWith(
        "Finish saved activity?",
        expect.stringContaining("without resuming recording"),
        expect.any(Array),
        { cancelable: false },
      ),
    );
    const buttons = alertMock.mock.calls.at(-1)?.[2] as Array<{
      text: string;
      onPress: () => void;
    }>;
    await act(async () => buttons.find((button) => button.text === "Finish")?.onPress());

    await waitFor(() => expect(serviceMock.retryRecoveredFinalization).toHaveBeenCalledTimes(1));
    expect(serviceMock.resumeRecoveredRecording).not.toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith("/record/submit");
  });

  it("requires a second confirmation before discard", async () => {
    render(
      <ActivityRecorderProvider profile={{ id: "profile-1" }}>
        <Text>child</Text>
      </ActivityRecorderProvider>,
    );
    await waitFor(() => expect(alertMock).toHaveBeenCalled());
    const promptButtons = alertMock.mock.calls.at(-1)?.[2] as Array<{
      text: string;
      onPress: () => void;
    }>;
    act(() => promptButtons.find((button) => button.text === "Discard")?.onPress());
    expect(serviceMock.discardRecoveredRecording).not.toHaveBeenCalled();
    const confirmButtons = alertMock.mock.calls.at(-1)?.[2] as Array<{
      text: string;
      onPress: () => void;
    }>;
    await act(async () => confirmButtons.find((button) => button.text === "Discard")?.onPress());
    await waitFor(() => expect(serviceMock.discardRecoveredRecording).toHaveBeenCalledTimes(1));
  });

  it("keeps the checkpoint and allows retry when discard fails", async () => {
    serviceMock.discardRecoveredRecording
      .mockRejectedValueOnce(new Error("Checkpoint storage unavailable"))
      .mockResolvedValueOnce(undefined);
    render(
      <ActivityRecorderProvider profile={{ id: "profile-1" }}>
        <RecoveryStatus />
      </ActivityRecorderProvider>,
    );
    await waitFor(() =>
      expect(alertMock).toHaveBeenCalledWith(
        "Resume recording?",
        expect.anything(),
        expect.anything(),
        expect.anything(),
      ),
    );

    act(() => pressLatestAlertButton("Discard"));
    await act(async () => pressLatestAlertButton("Discard"));

    await waitFor(() =>
      expect(alertMock).toHaveBeenCalledWith(
        "Unable to discard",
        "Checkpoint storage unavailable",
        expect.any(Array),
      ),
    );
    expect(screen.getByText("Recovery available")).toBeTruthy();
    await act(async () => pressLatestAlertButton("Try again"));

    await waitFor(() => expect(serviceMock.discardRecoveredRecording).toHaveBeenCalledTimes(2));
    expect(screen.getByText("No recovery")).toBeTruthy();
  });

  it("quarantines a checkpoint when durable stream replay is corrupt", async () => {
    serviceMock.stageRecoveredCheckpoint.mockRejectedValueOnce(new Error("Corrupt stream chunk"));
    render(
      <ActivityRecorderProvider profile={{ id: "profile-1" }}>
        <Text>child</Text>
      </ActivityRecorderProvider>,
    );
    await waitFor(() =>
      expect(checkpointMocks.quarantineActiveRecordingCheckpoint).toHaveBeenCalledWith(
        "Corrupt stream chunk",
        "profile-1",
        checkpoint.sessionId,
      ),
    );
    expect(alertMock).toHaveBeenCalledWith(
      "Recording recovery unavailable",
      "Corrupt stream chunk",
    );
    expect(checkpointMocks.releaseRecordingCheckpointClaim).toHaveBeenCalledWith(
      checkpoint.sessionId,
    );
    expect(serviceMock.resumeRecoveredRecording).not.toHaveBeenCalled();
  });

  it("does not interrupt app startup when recovery inspection is unavailable", async () => {
    const warning = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    startupMocks.prepareMobileRecordingStartup.mockRejectedValueOnce(
      new Error("Could not load bundle"),
    );

    try {
      render(
        <ActivityRecorderProvider profile={{ id: "profile-1" }}>
          <Text>child</Text>
        </ActivityRecorderProvider>,
      );

      await waitFor(() =>
        expect(warning).toHaveBeenCalledWith(
          "[ActivityRecorderProvider] Unable to inspect saved recording recovery",
          expect.objectContaining({ message: "Could not load bundle" }),
        ),
      );
      expect(alertMock).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });

  it("disposes the profile-scoped recorder before exposing a different profile", async () => {
    startupMocks.prepareMobileRecordingStartup.mockResolvedValue({
      checkpoint: { status: "none" },
      queueJobs: [],
      hasQuarantinedEvidence: false,
      finalizedArtifactRecovery: [],
    });
    const view = render(
      <ActivityRecorderProvider profile={{ id: "profile-1" }}>
        <Text>child</Text>
      </ActivityRecorderProvider>,
    );
    await waitFor(() => expect(recorderConstructorMock).toHaveBeenCalledWith({ id: "profile-1" }));

    let finishCleanup: (() => void) | undefined;
    serviceMock.cleanup.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        }),
    );

    view.rerender(
      <ActivityRecorderProvider profile={{ id: "profile-2" }}>
        <Text>child</Text>
      </ActivityRecorderProvider>,
    );

    await waitFor(() => expect(serviceMock.cleanup).toHaveBeenCalledWith({ dispose: true }));
    expect(recorderConstructorMock).not.toHaveBeenCalledWith({ id: "profile-2" });
    await act(async () => finishCleanup?.());
    await waitFor(() => expect(recorderConstructorMock).toHaveBeenCalledWith({ id: "profile-2" }));
  });

  it("invalidates an old profile's recovery prompt during an account switch", async () => {
    startupMocks.prepareMobileRecordingStartup.mockImplementation(async (profileId: string) => ({
      checkpoint:
        profileId === "profile-1" ? { status: "recovered", checkpoint } : { status: "none" },
      queueJobs: [],
      hasQuarantinedEvidence: false,
      finalizedArtifactRecovery: [],
    }));
    const view = render(
      <ActivityRecorderProvider profile={{ id: "profile-1" }}>
        <RecoveryStatus />
      </ActivityRecorderProvider>,
    );
    await waitFor(() =>
      expect(alertMock).toHaveBeenCalledWith(
        "Resume recording?",
        expect.anything(),
        expect.anything(),
        expect.anything(),
      ),
    );
    const oldPromptButtons = alertMock.mock.calls.at(-1)?.[2] as Array<{
      text: string;
      onPress: () => void;
    }>;

    view.rerender(
      <ActivityRecorderProvider profile={{ id: "profile-2" }}>
        <RecoveryStatus />
      </ActivityRecorderProvider>,
    );
    await act(async () => oldPromptButtons.find((button) => button.text === "Resume")?.onPress());

    expect(serviceMock.resumeRecoveredRecording).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("No recovery")).toBeTruthy());
  });

  it("releases a recovery claim when staging finishes after an account switch", async () => {
    startupMocks.prepareMobileRecordingStartup.mockImplementation(async (profileId: string) => ({
      checkpoint:
        profileId === "profile-1" ? { status: "recovered", checkpoint } : { status: "none" },
      queueJobs: [],
      hasQuarantinedEvidence: false,
      finalizedArtifactRecovery: [],
    }));
    let finishStaging: (() => void) | undefined;
    serviceMock.stageRecoveredCheckpoint.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishStaging = resolve;
        }),
    );
    const view = render(
      <ActivityRecorderProvider profile={{ id: "profile-1" }}>
        <RecoveryStatus />
      </ActivityRecorderProvider>,
    );
    await waitFor(() => expect(serviceMock.stageRecoveredCheckpoint).toHaveBeenCalled());

    view.rerender(
      <ActivityRecorderProvider profile={{ id: "profile-2" }}>
        <RecoveryStatus />
      </ActivityRecorderProvider>,
    );
    expect(serviceMock.cleanup).not.toHaveBeenCalled();
    expect(recorderConstructorMock).not.toHaveBeenCalledWith({ id: "profile-2" });
    await act(async () => finishStaging?.());

    await waitFor(() =>
      expect(checkpointMocks.releaseRecordingCheckpointClaim).toHaveBeenCalledWith(
        checkpoint.sessionId,
      ),
    );
    expect(screen.getByText("No recovery")).toBeTruthy();
    expect(alertMock).not.toHaveBeenCalledWith(
      "Resume recording?",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("retains a resumed claim until the owning profile service is disposed", async () => {
    const view = render(
      <ActivityRecorderProvider profile={{ id: "profile-1" }}>
        <RecoveryStatus />
      </ActivityRecorderProvider>,
    );
    await waitFor(() =>
      expect(alertMock).toHaveBeenCalledWith(
        "Resume recording?",
        expect.anything(),
        expect.anything(),
        expect.anything(),
      ),
    );
    await act(async () => pressLatestAlertButton("Resume"));
    await waitFor(() => expect(serviceMock.resumeRecoveredRecording).toHaveBeenCalled());
    expect(checkpointMocks.releaseRecordingCheckpointClaim).not.toHaveBeenCalled();
    startupMocks.prepareMobileRecordingStartup.mockResolvedValue({
      checkpoint: { status: "none" },
      queueJobs: [],
      hasQuarantinedEvidence: false,
      finalizedArtifactRecovery: [],
    });

    view.rerender(
      <ActivityRecorderProvider profile={{ id: "profile-2" }}>
        <RecoveryStatus />
      </ActivityRecorderProvider>,
    );

    await waitFor(() => expect(serviceMock.cleanup).toHaveBeenCalledWith({ dispose: true }));
    await waitFor(() =>
      expect(checkpointMocks.releaseRecordingCheckpointClaim).toHaveBeenCalledWith(
        checkpoint.sessionId,
      ),
    );
    await waitFor(() => expect(recorderConstructorMock).toHaveBeenCalledWith({ id: "profile-2" }));
  });

  it("honors a teardown obligation across a rapid profile switch back", async () => {
    startupMocks.prepareMobileRecordingStartup.mockImplementation(async (profileId: string) => ({
      checkpoint:
        profileId === "profile-1" ? { status: "recovered", checkpoint } : { status: "none" },
      queueJobs: [],
      hasQuarantinedEvidence: false,
      finalizedArtifactRecovery: [],
    }));
    let finishStaging: (() => void) | undefined;
    serviceMock.stageRecoveredCheckpoint.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishStaging = resolve;
        }),
    );
    const view = render(
      <ActivityRecorderProvider profile={{ id: "profile-1" }}>
        <RecoveryStatus />
      </ActivityRecorderProvider>,
    );
    await waitFor(() => expect(serviceMock.stageRecoveredCheckpoint).toHaveBeenCalled());

    view.rerender(
      <ActivityRecorderProvider profile={{ id: "profile-2" }}>
        <RecoveryStatus />
      </ActivityRecorderProvider>,
    );
    view.rerender(
      <ActivityRecorderProvider profile={{ id: "profile-1" }}>
        <RecoveryStatus />
      </ActivityRecorderProvider>,
    );
    expect(recorderConstructorMock).toHaveBeenCalledTimes(1);
    await act(async () => finishStaging?.());

    await waitFor(() => expect(serviceMock.cleanup).toHaveBeenCalledWith({ dispose: true }));
    await waitFor(() => expect(recorderConstructorMock).toHaveBeenCalledTimes(2));
    expect(recorderConstructorMock).not.toHaveBeenCalledWith({ id: "profile-2" });
  });

  it("retries a failed cleanup before exposing the next profile service", async () => {
    startupMocks.prepareMobileRecordingStartup.mockResolvedValue({
      checkpoint: { status: "none" },
      queueJobs: [],
      hasQuarantinedEvidence: false,
      finalizedArtifactRecovery: [],
    });
    const view = render(
      <ActivityRecorderProvider profile={{ id: "profile-1" }}>
        <Text>child</Text>
      </ActivityRecorderProvider>,
    );
    await waitFor(() => expect(recorderConstructorMock).toHaveBeenCalledWith({ id: "profile-1" }));
    serviceMock.cleanup.mockRejectedValueOnce(new Error("Native teardown still settling"));

    view.rerender(
      <ActivityRecorderProvider profile={{ id: "profile-2" }}>
        <Text>child</Text>
      </ActivityRecorderProvider>,
    );

    await waitFor(() => expect(serviceMock.cleanup).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(recorderConstructorMock).toHaveBeenCalledWith({ id: "profile-2" }));
  });

  it("offers a fenced manual retry when bounded cleanup attempts fail", async () => {
    startupMocks.prepareMobileRecordingStartup.mockResolvedValue({
      checkpoint: { status: "none" },
      queueJobs: [],
      hasQuarantinedEvidence: false,
      finalizedArtifactRecovery: [],
    });
    const view = render(
      <ActivityRecorderProvider profile={{ id: "profile-1" }}>
        <Text>child</Text>
      </ActivityRecorderProvider>,
    );
    await waitFor(() => expect(recorderConstructorMock).toHaveBeenCalledWith({ id: "profile-1" }));
    serviceMock.cleanup
      .mockRejectedValueOnce(new Error("Native teardown still settling"))
      .mockRejectedValueOnce(new Error("Native teardown still settling"));

    view.rerender(
      <ActivityRecorderProvider profile={{ id: "profile-2" }}>
        <Text>child</Text>
      </ActivityRecorderProvider>,
    );

    await waitFor(() =>
      expect(alertMock).toHaveBeenCalledWith(
        "Recording service unavailable",
        expect.any(String),
        expect.any(Array),
        { cancelable: false },
      ),
    );
    expect(recorderConstructorMock).not.toHaveBeenCalledWith({ id: "profile-2" });
    await act(async () => pressLatestAlertButton("Try again"));

    await waitFor(() => expect(serviceMock.cleanup).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(recorderConstructorMock).toHaveBeenCalledWith({ id: "profile-2" }));
  });

  it("fences a hook-triggered discard before disposing the profile service", async () => {
    startupMocks.prepareMobileRecordingStartup.mockResolvedValue({
      checkpoint: { status: "recovered", checkpoint },
      queueJobs: [],
      hasQuarantinedEvidence: false,
      finalizedArtifactRecovery: [],
    });
    let finishDiscard: (() => void) | undefined;
    serviceMock.discardRecoveredRecording.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishDiscard = resolve;
        }),
    );
    const view = render(
      <ActivityRecorderProvider profile={{ id: "profile-1" }}>
        <RecoveryCommandProbe />
      </ActivityRecorderProvider>,
    );
    await waitFor(() => expect(screen.getByText("Recovery available")).toBeTruthy());

    let discard: Promise<void> | undefined;
    act(() => {
      discard = recoveryCommands?.discard();
    });
    view.rerender(
      <ActivityRecorderProvider profile={{ id: "profile-2" }}>
        <RecoveryCommandProbe />
      </ActivityRecorderProvider>,
    );
    expect(serviceMock.cleanup).not.toHaveBeenCalled();
    await act(async () => finishDiscard?.());
    await act(async () => discard);

    await waitFor(() => expect(serviceMock.cleanup).toHaveBeenCalledWith({ dispose: true }));
    await waitFor(() => expect(recorderConstructorMock).toHaveBeenCalledWith({ id: "profile-2" }));
  });
});
