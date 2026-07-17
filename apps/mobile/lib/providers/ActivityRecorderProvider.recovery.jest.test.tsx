import { Text } from "@repo/ui/components/text";
import { act, render, waitFor } from "@testing-library/react-native";

const checkpoint = { sessionId: "profile-1:session", profileId: "profile-1" };

jest.mock("react-native", () => ({
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
}));
jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));
jest.mock("../services/mobileRecordingStartup", () => ({
  prepareMobileRecordingStartup: jest.fn(async () => ({
    checkpoint: {
      status: "recovered",
      checkpoint: { sessionId: "profile-1:session", profileId: "profile-1" },
    },
    queueJobs: [],
    hasQuarantinedEvidence: false,
  })),
}));
jest.mock("../services/ActivityRecorder/checkpointStorage", () => ({
  loadAndClaimRecordingCheckpoint: jest.fn(async () => ({
    status: "recovered",
    checkpoint: { sessionId: "profile-1:session", profileId: "profile-1" },
  })),
  quarantineActiveRecordingCheckpoint: jest.fn(async () => undefined),
  releaseRecordingCheckpointClaim: jest.fn(),
}));
jest.mock("../services/ActivityRecorder", () => {
  const service = {
    hasConfiguredRecordingSetup: false,
    stageRecoveredCheckpoint: jest.fn(async () => undefined),
    resumeRecoveredRecording: jest.fn(async () => undefined),
    discardRecoveredRecording: jest.fn(async () => undefined),
    cleanup: jest.fn(async () => undefined),
  };
  return { __service: service, ActivityRecorderService: jest.fn(() => service) };
});

import { ActivityRecorderProvider } from "./ActivityRecorderProvider";

const alertMock = (jest.requireMock("react-native") as { Alert: { alert: jest.Mock } }).Alert.alert;
const replaceMock = (jest.requireMock("expo-router") as { router: { replace: jest.Mock } }).router
  .replace;
const serviceMock = (
  jest.requireMock("../services/ActivityRecorder") as {
    __service: {
      stageRecoveredCheckpoint: jest.Mock;
      resumeRecoveredRecording: jest.Mock;
      discardRecoveredRecording: jest.Mock;
    };
  }
).__service;
const checkpointMocks = jest.requireMock("../services/ActivityRecorder/checkpointStorage") as {
  quarantineActiveRecordingCheckpoint: jest.Mock;
};

describe("ActivityRecorderProvider recovery prompt", () => {
  beforeEach(() => jest.clearAllMocks());

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
      ),
    );
    expect(serviceMock.resumeRecoveredRecording).not.toHaveBeenCalled();
  });
});
