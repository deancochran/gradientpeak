import { fireEvent, renderNative, screen } from "../../../../test/render-native";

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: "Text",
}));

const { RecordingControls } = require("../RecordingControls");

function renderControls(
  recordingState: "not_started" | "recording" | "paused",
  handlers = {
    onStart: jest.fn(),
    onPause: jest.fn(),
    onResume: jest.fn(),
    onLap: jest.fn(),
    onFinish: jest.fn(),
    onDiscard: jest.fn(),
  },
) {
  renderNative(<RecordingControls recordingState={recordingState} {...handlers} />);
  return handlers;
}

describe("RecordingControls", () => {
  it("renders an accessible Start control and preserves its action", () => {
    const handlers = renderControls("not_started");
    const start = screen.getByTestId("recording-start-button");

    fireEvent.press(start);

    expect(handlers.onStart).toHaveBeenCalledTimes(1);
    expect(start.props.accessibilityLabel).toBe("Start recording");
    expect(start.props.accessibilityRole).toBe("button");
    expect(start.props.className).toContain("h-14");
    expect(start.props.className).toContain("active:opacity-80");
  });

  it("renders accessible Pause and Lap controls while recording", () => {
    const handlers = renderControls("recording");
    const pause = screen.getByTestId("recording-pause-button");
    const lap = screen.getByTestId("recording-lap-button");

    fireEvent.press(pause);
    fireEvent.press(lap);

    expect(handlers.onPause).toHaveBeenCalledTimes(1);
    expect(handlers.onLap).toHaveBeenCalledTimes(1);
    expect(pause.props).toMatchObject({
      accessibilityLabel: "Pause recording",
      accessibilityRole: "button",
    });
    expect(lap.props).toMatchObject({
      accessibilityLabel: "Record lap",
      accessibilityRole: "button",
    });
    expect(pause.props.className).toContain("h-12");
    expect(lap.props.className).toContain("h-12");
    expect(pause.props.className).toContain("active:opacity-80");
    expect(lap.props.className).toContain("active:opacity-80");
  });

  it("renders accessible Resume and Finish controls while paused", () => {
    const handlers = renderControls("paused");
    const resume = screen.getByTestId("recording-resume-button");
    const finish = screen.getByTestId("recording-finish-button");

    fireEvent.press(resume);
    fireEvent.press(finish);

    expect(handlers.onResume).toHaveBeenCalledTimes(1);
    expect(handlers.onFinish).toHaveBeenCalledTimes(1);
    expect(resume.props).toMatchObject({
      accessibilityLabel: "Resume recording",
      accessibilityRole: "button",
    });
    expect(finish.props).toMatchObject({
      accessibilityLabel: "Finish recording",
      accessibilityRole: "button",
    });
    expect(resume.props.className).toContain("h-12");
    expect(finish.props.className).toContain("h-12");
    expect(resume.props.className).toContain("active:opacity-80");
    expect(finish.props.className).toContain("active:opacity-80");
  });
});
