import type { Meta, StoryObj } from "@storybook/react-native";
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
    const [value, setValue] = React.useState<string>(args.value);

    return (
      <View className="bg-background p-6">
        <PaceInput {...args} onChange={setValue} value={value} />
      </View>
    );
  },
};
export const Canonical195Seconds: Story = {
  ...Playground,
  args: { value: "3:15", unitLabel: "/km" },
};
export const OptionalUnset: Story = { ...Playground, args: { value: "", required: false } };
export const HoursMinutesSeconds: Story = {
  ...Playground,
  args: { layout: "hms", value: "90:30" },
};
export const LongPaceWindow: Story = { ...Playground, args: { layout: "ms", value: "360000:30" } };
