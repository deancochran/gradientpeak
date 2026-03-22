import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { View } from "react-native";

import { boundedNumberInputFixtures } from "./fixtures";
import { BoundedNumberInput } from "./index.native";

const meta = {
  title: "Inputs/BoundedNumberInput/Native",
  component: BoundedNumberInput,
  args: {
    ...boundedNumberInputFixtures.ftp,
    onChange: () => {},
  },
} satisfies Meta<typeof BoundedNumberInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = React.useState<string>(boundedNumberInputFixtures.ftp.value);

    return (
      <View className="bg-background p-6">
        <BoundedNumberInput {...args} onChange={setValue} value={value} />
      </View>
    );
  },
};
