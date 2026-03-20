import type { Meta, StoryObj } from "@storybook/react";

import { Input } from "./index.web";

const meta = {
  title: "Components/Input",
  component: Input,
  tags: ["autodocs"],
  args: {
    placeholder: "runner@example.com",
    type: "email",
  },
} satisfies Meta<typeof Input>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <div className="w-80">
      <Input {...args} />
    </div>
  ),
};

export const States: Story = {
  render: () => (
    <div className="grid w-80 gap-4">
      <Input placeholder="Default field" />
      <Input defaultValue="Editable value" />
      <Input aria-invalid defaultValue="Needs attention" />
      <Input disabled defaultValue="Disabled value" />
    </div>
  ),
};
