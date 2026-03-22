import { fireEvent, renderNative } from "../../test/render-native";
import { ErrorStateCard, getErrorMessage } from "./index.native";

describe("ErrorStateCard native", () => {
  it("renders retry actions and maps common errors", () => {
    const onRetry = jest.fn();

    const { getByText } = renderNative(<ErrorStateCard message="Load failed" onRetry={onRetry} />);

    fireEvent.press(getByText("Try Again"));
    expect(onRetry).toHaveBeenCalled();
    expect(getErrorMessage(new Error("Network request failed"))).toBe(
      "Unable to connect. Please check your internet connection.",
    );
  });
});
