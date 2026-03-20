import type { Meta, StoryObj } from "@storybook/react";

import { Input } from "../input/index.web";
import { Label } from "./index.web";

const meta = {
  title: "Components/Label",
  component: Label,
  tags: ["autodocs"],
  args: {
    children: "Email address",
  },
} satisfies Meta<typeof Label>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => <Label {...args} htmlFor="storybook-label-field" />,
};

export const WithInput: Story = {
  render: () => (
    <div className="grid w-80 gap-2">
      <Label htmlFor="work-email">Work email</Label>
      <Input
        id="work-email"
        placeholder="coach@gradientpeak.com"
        type="email"
      />
    </div>
  ),
};
