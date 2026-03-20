import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => import("../test/react-native"));

import * as Accordion from "./accordion/index.native";
import * as Alert from "./alert/index.native";
import * as AlertDialog from "./alert-dialog/index.native";
import * as AspectRatio from "./aspect-ratio/index.native";
import * as Avatar from "./avatar/index.native";
import * as Badge from "./badge/index.native";
import * as Checkbox from "./checkbox/index.native";
import * as Collapsible from "./collapsible/index.native";
import * as ContextMenu from "./context-menu/index.native";
import * as Dialog from "./dialog/index.native";
import * as DropdownMenu from "./dropdown-menu/index.native";
import * as Form from "./form/index.native";
import * as HoverCard from "./hover-card/index.native";
import * as Icon from "./icon/index.native";
import * as Label from "./label/index.native";
import * as Menubar from "./menubar/index.native";
import * as NativeOnlyAnimatedView from "./native-only-animated-view/index.native";
import * as Popover from "./popover/index.native";
import * as Progress from "./progress/index.native";
import * as RadioGroup from "./radio-group/index.native";
import * as Select from "./select/index.native";
import * as Separator from "./separator/index.native";
import * as Skeleton from "./skeleton/index.native";
import * as Slider from "./slider/index.native";
import * as Text from "./text/index.native";
import * as Textarea from "./textarea/index.native";
import * as Toggle from "./toggle/index.native";
import * as ToggleGroup from "./toggle-group/index.native";
import * as Tooltip from "./tooltip/index.native";

describe("native component coverage", () => {
  it("keeps native component exports available", () => {
    expect(Accordion.Accordion).toBeTypeOf("function");
    expect(Alert.Alert).toBeTypeOf("function");
    expect(AlertDialog.AlertDialog).toBeTypeOf("function");
    expect(AspectRatio.AspectRatio).toBeTypeOf("function");
    expect(Avatar.Avatar).toBeTypeOf("function");
    expect(Badge.Badge).toBeTypeOf("function");
    expect(Checkbox.Checkbox).toBeTypeOf("function");
    expect(Collapsible.Collapsible).toBeTypeOf("function");
    expect(ContextMenu.ContextMenu).toBeTypeOf("function");
    expect(Dialog.Dialog).toBeTypeOf("function");
    expect(DropdownMenu.DropdownMenu).toBeTypeOf("function");
    expect(Form.Form).toBeTypeOf("function");
    expect(HoverCard.HoverCard).toBeTypeOf("function");
    expect(Icon.Icon).toBeTypeOf("function");
    expect(Label.Label).toBeTypeOf("function");
    expect(Menubar.Menubar).toBeTypeOf("function");
    expect(NativeOnlyAnimatedView.NativeOnlyAnimatedView).toBeTypeOf(
      "function",
    );
    expect(Popover.Popover).toBeTypeOf("function");
    expect(Progress.Progress).toBeTypeOf("function");
    expect(RadioGroup.RadioGroup).toBeTypeOf("function");
    expect(Select.Select).toBeTypeOf("function");
    expect(Separator.Separator).toBeTypeOf("function");
    expect(Skeleton.Skeleton).toBeTypeOf("function");
    expect(Slider.Slider).toBeTypeOf("function");
    expect(Text.Text).toBeTypeOf("function");
    expect(Textarea.Textarea).toBeTypeOf("function");
    expect(Toggle.Toggle).toBeTypeOf("function");
    expect(ToggleGroup.ToggleGroup).toBeTypeOf("function");
    expect(Tooltip.Tooltip).toBeTypeOf("function");
  });
});
