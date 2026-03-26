import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { switchFixtures } from "./fixtures";
import { Switch } from "./index.web";
import { exerciseSwitchStory } from "./interactions";

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

export const Playground: Story = {
  render: (args) => {
    const [checked, setChecked] = useState(true);
    return <Switch {...args} checked={checked} onCheckedChange={setChecked} />;
  },
  play: async ({ canvasElement }) => {
    await exerciseSwitchStory({
      canvasElement,
      expectedLabel: switchFixtures.notifications.accessibilityLabel,
    });
  },
};

export const States: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Switch defaultChecked {...switchFixtures.notifications} />
      <Switch disabled {...switchFixtures.notifications} />
    </div>
  ),
};
