import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { Text } from "../text/index.native";
import { Disclosure } from "./index.native";

const meta = {
  title: "Components/Disclosure/Native",
  component: Disclosure,
  args: {
    label: "Optional details",
    open: false,
    onOpenChange: () => {},
    children: <Text>Additional details remain available without crowding the form.</Text>,
  },
} satisfies Meta<typeof Disclosure>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [open, setOpen] = useState(args.open);
    return (
      <View className="bg-background p-4">
        <Disclosure {...args} open={open} onOpenChange={setOpen} />
      </View>
    );
  },
};
export const Expanded: Story = { args: { open: true } };
export const Disabled: Story = { args: { disabled: true } };
