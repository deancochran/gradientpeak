import { act, renderNative, screen } from "../../../test/render-native";
import { DetailOverflowMenu } from "./DetailOverflowMenu";

describe("DetailOverflowMenu", () => {
  it("exposes an outcome-oriented, expanded-aware 44dp trigger", async () => {
    const rendered = await renderNative(
      <DetailOverflowMenu
        actions={[{ label: "Edit", onPress: jest.fn(), testID: "edit-action" }]}
        testID="detail-actions"
      />,
    );

    const trigger = screen.getByLabelText("Open actions menu");
    expect(trigger.props.accessibilityRole).toBe("button");
    expect(trigger.props.accessibilityState).toMatchObject({ expanded: false });
    expect(trigger.props.className).toContain("min-h-11");
    expect(trigger.props.className).toContain("min-w-11");

    await act(() =>
      rendered.container
        .queryAll((node) => node.type === "@rn-primitives/dropdown-menu.Root")[0]
        ?.props.onOpenChange(true),
    );

    expect(screen.getByLabelText("Open actions menu").props.accessibilityState).toMatchObject({
      expanded: true,
    });
  });
});
