import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { View } from "react-native";

import { selectFixtures } from "./fixtures";
import {
  NativeSelectScrollView,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./index.native";

const meta = {
  title: "Components/Select/Native",
  component: Select,
  args: {
    value: selectFixtures.workoutType.options[1],
    onValueChange: () => {},
  },
} satisfies Meta<typeof Select>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = React.useState<
      | ((typeof selectFixtures.workoutType.options)[number] & { label: string; value: string })
      | undefined
    >(selectFixtures.workoutType.options[1]);

    return (
      <View className="bg-background p-6">
        <Select
          {...args}
          onValueChange={(option) => setValue(option as typeof value)}
          value={value}
        >
          <SelectTrigger>
            <SelectValue placeholder={selectFixtures.workoutType.placeholder} />
          </SelectTrigger>
          <SelectContent>
            <NativeSelectScrollView>
              {selectFixtures.workoutType.options.map((option) => (
                <SelectItem key={option.value} label={option.label} value={option as never} />
              ))}
            </NativeSelectScrollView>
          </SelectContent>
        </Select>
      </View>
    );
  },
};
