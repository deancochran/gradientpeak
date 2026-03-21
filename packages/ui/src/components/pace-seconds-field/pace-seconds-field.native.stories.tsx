import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { View } from "react-native";

import { paceSecondsFieldFixtures } from "./fixtures";
import { PaceSecondsField } from "./index.native";

const meta = {
  title: "Inputs/PaceSecondsField/Native",
  component: PaceSecondsField,
  args: {
    ...paceSecondsFieldFixtures.easy,
    onChangeSeconds: () => {},
  },
} satisfies Meta<typeof PaceSecondsField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [valueSeconds, setValueSeconds] = React.useState<number | null>(
      paceSecondsFieldFixtures.easy.valueSeconds,
    );

    return (
      <View className="bg-background p-6">
        <PaceSecondsField {...args} onChangeSeconds={setValueSeconds} valueSeconds={valueSeconds} />
      </View>
    );
  },
};
