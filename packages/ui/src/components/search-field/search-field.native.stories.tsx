import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { View } from "react-native";
import { SearchField } from "./index.native";

const meta = {
  title: "Inputs/SearchField/Native",
  component: SearchField,
  args: {
    accessibilityLabel: "Search routes",
    onValueChange: () => {},
    placeholder: "Search routes",
    testId: "search-field-native-story",
    value: "",
  },
} satisfies Meta<typeof SearchField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <View className="bg-background p-6">
        <SearchField {...args} onValueChange={setValue} value={value} />
      </View>
    );
  },
};

export const Loading: Story = { args: { loading: true, value: "mountain" } };
export const Disabled: Story = { args: { disabled: true, value: "recovery" } };
