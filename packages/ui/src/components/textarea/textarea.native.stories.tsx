import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { View } from "react-native";

import { textareaFixtures } from "./fixtures";
import { Textarea } from "./index.native";

const meta = {
  title: "Components/Textarea/Native",
  component: Textarea,
  args: {
    ...textareaFixtures.notes,
    value: textareaFixtures.value,
    onChangeText: () => {},
  },
} satisfies Meta<typeof Textarea>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = React.useState<string>(textareaFixtures.value);

    return (
      <View className="bg-background p-6">
        <Textarea {...args} onChangeText={setValue} value={value} />
      </View>
    );
  },
};
