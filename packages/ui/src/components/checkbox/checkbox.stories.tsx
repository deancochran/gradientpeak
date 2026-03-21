import type { Meta, StoryObj } from "@storybook/react";

import { checkboxFixtures } from "./fixtures";
import { Checkbox } from "./index.web";

const meta = {
  title: "Components/Checkbox",
  component: Checkbox,
  tags: ["autodocs"],
  args: {
    ...checkboxFixtures.terms,
    checked: true,
  },
} satisfies Meta<typeof Checkbox>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const States: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Checkbox defaultChecked {...checkboxFixtures.terms} />
      <Checkbox disabled {...checkboxFixtures.terms} />
    </div>
  ),
};
