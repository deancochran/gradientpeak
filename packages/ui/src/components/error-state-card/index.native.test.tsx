import { fireEvent, renderNative } from "../../test/render-native";
import { errorStateCardFixtures } from "./fixtures";
import { ErrorMessage, ErrorStateCard } from "./index.native";

describe("ErrorStateCard native", () => {
  it("renders retryable card content from fixtures", () => {
    const onRetry = jest.fn();
    const { getByText } = renderNative(
      <ErrorStateCard {...errorStateCardFixtures.generic} onRetry={onRetry} />,
    );

    expect(getByText(errorStateCardFixtures.generic.title!)).toBeTruthy();
    fireEvent.press(getByText(errorStateCardFixtures.generic.retryLabel!));
    expect(onRetry).toHaveBeenCalled();
  });

  it("renders inline message content", () => {
    const { getByText } = renderNative(<ErrorMessage {...errorStateCardFixtures.inline} />);

    expect(getByText(errorStateCardFixtures.inline.message)).toBeTruthy();
  });
});
