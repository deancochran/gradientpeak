import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { View } from "react-native";

import { paceInputFixtures } from "./fixtures";
import { PaceInput } from "./index.native";

const meta = {
  title: "Inputs/PaceInput/Native",
  component: PaceInput,
  args: {
    ...paceInputFixtures.threshold,
    onChange: () => {},
  },
} satisfies Meta<typeof PaceInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = React.useState<string>(paceInputFixtures.threshold.value);

    return (
      <View className="bg-background p-6">
        <PaceInput {...args} onChange={setValue} value={value} />
      </View>
    );
  },
};
