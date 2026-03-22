import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { View } from "react-native";

import { Text } from "../text/index.native";
import { radioGroupFixtures } from "./fixtures";
import { RadioGroup, RadioGroupItem } from "./index.native";

const meta = {
  title: "Components/RadioGroup/Native",
  component: RadioGroup,
  args: {
    value: radioGroupFixtures.sport.value,
    onValueChange: () => {},
  },
} satisfies Meta<typeof RadioGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = React.useState<string>(radioGroupFixtures.sport.value);

    return (
      <RadioGroup {...args} onValueChange={setValue} value={value}>
        {radioGroupFixtures.sport.options.map((option) => (
          <View key={option.value} className="flex-row items-center gap-2">
            <RadioGroupItem value={option.value} />
            <Text className="text-foreground">{option.label}</Text>
          </View>
        ))}
      </RadioGroup>
    );
  },
};
