import type { Meta, StoryObj } from "@storybook/react";

import { Input } from "../input/index.web";
import { labelFixtures } from "./fixtures";
import { Label } from "./index.web";

const meta = {
  title: "Components/Label",
  component: Label,
  tags: ["autodocs"],
  args: {
    ...labelFixtures.email,
  },
} satisfies Meta<typeof Label>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => <Label {...args} htmlFor={labelFixtures.email.htmlFor} />,
};

export const WithInput: Story = {
  render: () => (
    <div className="grid w-80 gap-2">
      <Label htmlFor={labelFixtures.workEmail.htmlFor}>
        {labelFixtures.workEmail.children}
      </Label>
      <Input
        id={labelFixtures.workEmail.htmlFor}
        placeholder="coach@gradientpeak.com"
        type="email"
      />
    </div>
  ),
};
