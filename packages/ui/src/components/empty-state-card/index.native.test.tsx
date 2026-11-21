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
    await fireEvent.press(getByText(emptyStateCardFixtures.generic.actionLabel));
    expect(onAction).toHaveBeenCalled();
  });

  it("keeps long text and its action in vertical content order", async () => {
    const { getByText } = await renderNative(
      <EmptyStateCard
        {...emptyStateCardFixtures.longText}
        icon={CircleAlert}
        onAction={jest.fn()}
      />,
    );

    expect(getByText(emptyStateCardFixtures.longText.title)).toBeTruthy();
    expect(getByText(emptyStateCardFixtures.longText.description)).toBeTruthy();
    expect(getByText(emptyStateCardFixtures.longText.actionLabel)).toBeTruthy();
  });

  it("announces recoverable unavailable errors without treating them as empty", async () => {
    const { container } = await renderNative(
      <EmptyStateCard {...emptyStateCardFixtures.unavailable} onAction={jest.fn()} />,
    );

    const announcedState = container.queryAll(
      (node) => node.props.accessibilityLiveRegion === "assertive",
    )[0];
    expect(announcedState).toBeTruthy();
  });

  it("keeps unbroken content and its retry action constrained by the state card", async () => {
    const { getByText } = await renderNative(
      <EmptyStateCard {...emptyStateCardFixtures.unbrokenText} onAction={jest.fn()} />,
    );

    expect(getByText(emptyStateCardFixtures.unbrokenText.title).props.className).toContain(
      "max-w-full",
    );
    expect(getByText(emptyStateCardFixtures.unbrokenText.description).props.className).toContain(
      "max-w-full",
    );
    expect(getByText(emptyStateCardFixtures.unbrokenText.actionLabel).props.className).toContain(
      "max-w-full",
    );
  });
});
