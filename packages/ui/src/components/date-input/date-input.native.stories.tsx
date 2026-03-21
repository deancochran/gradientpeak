import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { View } from "react-native";

import { dateInputFixtures } from "./fixtures";
import { DateInput } from "./index.native";

const meta = {
  title: "Inputs/DateInput/Native",
  component: DateInput,
  args: {
    ...dateInputFixtures.raceDay,
    onChange: () => {},
  },
} satisfies Meta<typeof DateInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = React.useState<string | undefined>(dateInputFixtures.raceDay.value);

    return (
      <View className="bg-background p-6">
        <DateInput {...args} onChange={setValue} value={value} />
      </View>
    );
  },
};
