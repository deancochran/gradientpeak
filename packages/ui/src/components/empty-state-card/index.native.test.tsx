import { CircleAlert } from "lucide-react-native";

import { fireEvent, renderNative } from "../../test/render-native";
import { emptyStateCardFixtures } from "./fixtures";
import { EmptyStateCard } from "./index.native";

describe("EmptyStateCard native", () => {
  it("renders content and action from fixtures", async () => {
    const onAction = jest.fn();
    const { getByText } = await renderNative(
      <EmptyStateCard {...emptyStateCardFixtures.generic} icon={CircleAlert} onAction={onAction} />,
    );

    expect(getByText(emptyStateCardFixtures.generic.title)).toBeTruthy();
    await fireEvent.press(getByText(emptyStateCardFixtures.generic.actionLabel!));
    expect(onAction).toHaveBeenCalled();
  });
});
