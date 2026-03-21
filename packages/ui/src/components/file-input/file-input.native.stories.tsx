import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { View } from "react-native";

import { fileInputFixtures } from "./fixtures";
import { FileInput } from "./index.native";

const meta = {
  title: "Inputs/FileInput/Native",
  component: FileInput,
  args: {
    ...fileInputFixtures.avatar,
    onFilesChange: () => {},
  },
} satisfies Meta<typeof FileInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <View className="bg-background p-6">
      <FileInput {...args} />
    </View>
  ),
};
