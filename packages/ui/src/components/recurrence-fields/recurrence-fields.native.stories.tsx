import { DEFAULT_WEEKLY_COUNT_RECURRENCE } from "@repo/core/recurrence";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { View } from "react-native";
import { RecurrenceFields } from "./index.native";

const meta = {
  title: "Inputs/RecurrenceFields/Native",
  component: RecurrenceFields,
} satisfies Meta<typeof RecurrenceFields>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WeeklyCount: Story = {
  args: {
    onChange: () => {},
    value: DEFAULT_WEEKLY_COUNT_RECURRENCE,
  },
  render: () => {
    const [value, setValue] = useState(DEFAULT_WEEKLY_COUNT_RECURRENCE);
    return (
      <View className="bg-background p-6">
        <RecurrenceFields onChange={setValue} value={value} />
      </View>
    );
  },
};
