import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { View } from "react-native";

import { numberSliderInputFixtures } from "./fixtures";
import { NumberSliderInput } from "./index.native";

const meta = {
  title: "Inputs/NumberSliderInput/Native",
  component: NumberSliderInput,
  args: {
    ...numberSliderInputFixtures.intensity,
    onChange: () => {},
  },
} satisfies Meta<typeof NumberSliderInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = React.useState<number>(numberSliderInputFixtures.intensity.value);

    return (
      <View className="bg-background p-6">
        <NumberSliderInput {...args} onChange={setValue} showNumericInput value={value} />
      </View>
    );
  },
};
