import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "@storybook/test";
import { useState } from "react";

import { toggleFixtures } from "./fixtures";
import { Toggle } from "./index.web";
import { exerciseToggleStory } from "./interactions";

const meta = {
  title: "Components/Toggle",
  component: Toggle,
  tags: ["autodocs"],
  args: {
    accessibilityLabel: toggleFixtures.pin.accessibilityLabel,
    testId: toggleFixtures.pin.testId,
  },
} satisfies Meta<typeof Toggle>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [pressed, setPressed] = useState(true);

    return (
      <Toggle {...args} onPressedChange={setPressed} pressed={pressed}>
        {toggleFixtures.pin.children}
      </Toggle>
    );
  },
  play: async ({ canvasElement }) => {
    const { toggle } = await exerciseToggleStory({
      canvasElement,
      expectedLabel: toggleFixtures.pin.accessibilityLabel,
    });

    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  },
};
