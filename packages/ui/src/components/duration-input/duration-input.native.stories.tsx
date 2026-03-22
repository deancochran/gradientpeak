import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { View } from "react-native";

import { durationInputFixtures } from "./fixtures";
import { DurationInput } from "./index.native";

const meta = {
  title: "Inputs/DurationInput/Native",
  component: DurationInput,
  args: {
    ...durationInputFixtures.workout,
    onChange: () => {},
  },
} satisfies Meta<typeof DurationInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = React.useState<string>(durationInputFixtures.workout.value);

    return (
      <View className="bg-background p-6">
        <DurationInput {...args} onChange={setValue} value={value} />
      </View>
    );
  },
};
