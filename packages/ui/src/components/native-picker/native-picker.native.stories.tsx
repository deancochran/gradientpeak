import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { nativePickerFixtures } from "./fixtures";
import { NativePicker, type NativePickerProps } from "./index.native";

function ControlledPicker(args: NativePickerProps<number>) {
  const [value, setValue] = useState(args.value);
  return <NativePicker {...args} value={value} onChange={setValue} />;
}
const meta = {
  title: "Inputs/NativePicker",
  component: NativePicker<number>,
  args: { ...nativePickerFixtures.rpe, onChange: () => {} },
  render: (args) => <ControlledPicker {...args} />,
} satisfies Meta<typeof NativePicker<number>>;
export default meta;
type Story = StoryObj<typeof meta>;
export const RPE: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const InvalidLegacy: Story = { args: { value: 5.25 } };
