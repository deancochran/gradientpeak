import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { View } from "react-native";

import { sliderFixtures } from "./fixtures";
import { Slider } from "./index.native";

const meta = {
  title: "Components/Slider/Native",
  component: Slider,
  args: {
    ...sliderFixtures.effort,
    onValueChange: () => {},
  },
} satisfies Meta<typeof Slider>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = React.useState<number>(sliderFixtures.effort.value);

    return (
      <View className="bg-background p-6">
        <Slider {...args} onValueChange={setValue} value={value} />
      </View>
    );
  },
};
