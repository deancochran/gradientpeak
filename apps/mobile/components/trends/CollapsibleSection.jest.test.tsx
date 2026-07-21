import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { fireEvent, renderNative, screen } from "../../test/render-native";
import { CollapsibleSection } from "./CollapsibleSection";

const TestIcon = (() => null) as unknown as LucideIcon;

describe("CollapsibleSection", () => {
  it("exposes a named, expanded-aware 44dp disclosure button", () => {
    renderNative(
      <CollapsibleSection icon={TestIcon} title="Training load">
        <View />
      </CollapsibleSection>,
    );

    const trigger = screen.getByLabelText("Training load");
    expect(trigger.props.accessibilityState).toEqual({ expanded: true });
    expect(trigger.props.className).toContain("min-h-11");

    fireEvent.press(trigger);

    expect(screen.getByLabelText("Training load").props.accessibilityState).toEqual({
      expanded: false,
    });
  });
});
