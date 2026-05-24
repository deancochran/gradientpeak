import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { View } from "react-native";

import { timeInputFixtures } from "./fixtures";
import { TimeInput } from "./index.native";

const meta = {
  title: "Inputs/TimeInput/Native",
  component: TimeInput,
  args: {
    ...timeInputFixtures.startTime,
    onChange: () => {},
    pickerPresentation: "modal",
  },
} satisfies Meta<typeof TimeInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = React.useState<string | undefined>(timeInputFixtures.startTime.value);

    return (
      <View className="bg-background p-6">
        <TimeInput {...args} onChange={setValue} value={value} />
      </View>
    );
  },
};
