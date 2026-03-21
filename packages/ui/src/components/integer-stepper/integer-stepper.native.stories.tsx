import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { View } from "react-native";

import { integerStepperFixtures } from "./fixtures";
import { IntegerStepper } from "./index.native";

const meta = {
  title: "Inputs/IntegerStepper/Native",
  component: IntegerStepper,
  args: {
    ...integerStepperFixtures.weeks,
    onChange: () => {},
  },
} satisfies Meta<typeof IntegerStepper>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = React.useState<number>(integerStepperFixtures.weeks.value);

    return (
      <View className="bg-background p-6">
        <IntegerStepper {...args} onChange={setValue} value={value} />
      </View>
    );
  },
};
