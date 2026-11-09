import { fireEvent, renderNative } from "../../test/render-native";
import { errorStateCardFixtures } from "./fixtures";
import { ErrorMessage, ErrorStateCard } from "./index.native";

describe("ErrorStateCard native", () => {
  it("renders retryable card content from fixtures", async () => {
    const onRetry = jest.fn();
    const { getByText } = await renderNative(
      <ErrorStateCard {...errorStateCardFixtures.generic} onRetry={onRetry} />,
    );

    expect(getByText(errorStateCardFixtures.generic.title)).toBeTruthy();
    await fireEvent.press(getByText(errorStateCardFixtures.generic.retryLabel));
    expect(onRetry).toHaveBeenCalled();
  });

  it("renders inline message content", async () => {
    const { getByText } = await renderNative(<ErrorMessage {...errorStateCardFixtures.inline} />);

    expect(getByText(errorStateCardFixtures.inline.message)).toBeTruthy();
  });
});
