import type { Meta, StoryObj } from "@storybook/react";

import { textareaFixtures } from "./fixtures";
import { Textarea } from "./index.web";

const meta = {
  title: "Components/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  args: {
    ...textareaFixtures.notes,
  },
} satisfies Meta<typeof Textarea>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const States: Story = {
  render: () => (
    <div className="grid w-96 gap-4">
      <Textarea {...textareaFixtures.notes} />
      <Textarea defaultValue={textareaFixtures.value} {...textareaFixtures.notes} />
      <Textarea disabled defaultValue={textareaFixtures.value} {...textareaFixtures.notes} />
    </div>
  ),
};
