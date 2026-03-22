import { fireEvent, renderNative } from "../../test/render-native";
import { EmptyStateCard } from "./index.native";

describe("EmptyStateCard native", () => {
  it("renders copy and action", () => {
    const onAction = jest.fn();

    const { getByText } = renderNative(
      <EmptyStateCard
        title="No activities"
        description="Add an activity to get started."
        actionLabel="Create"
        onAction={onAction}
      />,
    );

    expect(getByText("No activities")).toBeTruthy();
    fireEvent.press(getByText("Create"));
    expect(onAction).toHaveBeenCalled();
  });
});
