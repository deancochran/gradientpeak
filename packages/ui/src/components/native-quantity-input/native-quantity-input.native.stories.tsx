import type { Meta, StoryObj } from "@storybook/react-native";
import * as React from "react";
import { View } from "react-native";
import { nativeQuantityInputFixtures } from "./fixtures";
import { NativeQuantityInput } from "./index.native";

const meta = {
  title: "Inputs/NativeQuantityInput",
  component: NativeQuantityInput,
  args: nativeQuantityInputFixtures.distance,
} satisfies Meta<typeof NativeQuantityInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = React.useState(args.value);
    return (
      <View className="bg-background p-6">
        <NativeQuantityInput {...args} value={value} onChange={setValue} />
      </View>
    );
  },
};
