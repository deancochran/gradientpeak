import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { View } from "react-native";

import { checkboxFixtures } from "./fixtures";
import { Checkbox } from "./index.native";

const meta = {
  title: "Components/Checkbox/Native",
  component: Checkbox,
  args: {
    ...checkboxFixtures.terms,
    checked: false,
    onCheckedChange: () => {},
  },
} satisfies Meta<typeof Checkbox>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [checked, setChecked] = React.useState(false);

    return (
      <View className="bg-background p-6">
        <Checkbox {...args} checked={checked} onCheckedChange={setChecked} />
      </View>
    );
  },
};
