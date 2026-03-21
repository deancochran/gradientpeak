import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { View } from "react-native";

import { switchFixtures } from "./fixtures";
import { Switch } from "./index.native";

const meta = {
  title: "Components/Switch/Native",
  component: Switch,
  args: {
    ...switchFixtures.notifications,
    checked: true,
    onCheckedChange: () => {},
  },
} satisfies Meta<typeof Switch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [checked, setChecked] = React.useState(true);

    return (
      <View className="bg-background p-6">
        <Switch {...args} checked={checked} onCheckedChange={setChecked} />
      </View>
    );
  },
};
