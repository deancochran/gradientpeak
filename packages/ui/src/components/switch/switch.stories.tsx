import type { Meta, StoryObj } from "@storybook/react";

import { switchFixtures } from "./fixtures";
import { Switch } from "./index.web";

const meta = {
  title: "Components/Switch",
  component: Switch,
  tags: ["autodocs"],
  args: {
    ...switchFixtures.notifications,
    checked: true,
  },
} satisfies Meta<typeof Switch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const States: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Switch defaultChecked {...switchFixtures.notifications} />
      <Switch disabled {...switchFixtures.notifications} />
    </div>
  ),
};
