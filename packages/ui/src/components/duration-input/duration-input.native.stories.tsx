import type { Meta, StoryObj } from "@storybook/react-native";
import * as React from "react";
import { View } from "react-native";

import { durationInputFixtures } from "./fixtures";
import { DurationInput } from "./index.native";

const meta = {
  title: "Inputs/DurationInput/Native",
  component: DurationInput,
  args: {
    ...durationInputFixtures.activity,
    onChange: () => {},
  },
} satisfies Meta<typeof DurationInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = React.useState<string>(args.value);

    return (
      <View className="bg-background p-6">
        <DurationInput {...args} onChange={setValue} value={value} />
      </View>
    );
  },
};
export const PreciseGoalTime: Story = { ...Playground, args: { value: "0:25:42" } };
export const GoalBeyondDay: Story = { ...Playground, args: { value: "25:00:01" } };
export const OptionalUnset: Story = { ...Playground, args: { value: "", required: false } };
export const TestTimeMinutesSeconds: Story = {
  ...Playground,
  args: durationInputFixtures.testTime,
};
export const ExplicitHoursMinutesSeconds: Story = {
  ...Playground,
  args: durationInputFixtures.longGoal,
};
export const RequiredZeroNeedsCorrection: Story = {
  ...Playground,
  args: { value: "0:00:00", required: true },
};
