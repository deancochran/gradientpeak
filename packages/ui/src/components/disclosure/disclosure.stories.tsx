import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Disclosure } from "./index.web";

const meta = {
  title: "Components/Disclosure",
  component: Disclosure,
  args: {
    label: "Optional details",
    open: false,
    onOpenChange: () => {},
    children: "Additional details remain available without crowding the form.",
  },
} satisfies Meta<typeof Disclosure>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [open, setOpen] = useState(args.open);
    return <Disclosure {...args} open={open} onOpenChange={setOpen} />;
  },
};
export const Expanded: Story = { args: { open: true } };
export const Disabled: Story = { args: { disabled: true } };
