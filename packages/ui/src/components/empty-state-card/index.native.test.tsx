import { CircleAlert } from "lucide-react-native";

import { fireEvent, renderNative } from "../../test/render-native";
import { emptyStateCardFixtures } from "./fixtures";
import { EmptyStateCard } from "./index.native";

describe("EmptyStateCard native", () => {
  it("renders content and action from fixtures", () => {
    const onAction = jest.fn();
    const { getByText } = renderNative(
      <EmptyStateCard {...emptyStateCardFixtures.generic} icon={CircleAlert} onAction={onAction} />,
    );

    expect(getByText(emptyStateCardFixtures.generic.title)).toBeTruthy();
    fireEvent.press(getByText(emptyStateCardFixtures.generic.actionLabel!));
    expect(onAction).toHaveBeenCalled();
  });
});
