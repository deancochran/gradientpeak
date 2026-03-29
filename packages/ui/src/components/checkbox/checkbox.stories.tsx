import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { checkboxFixtures } from "./fixtures";
import { Checkbox } from "./index.web";
import { exerciseCheckboxStory } from "./interactions";

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

export const Playground: Story = {
  render: (args) => {
    const [checked, setChecked] = useState(true);
    return (
      <Checkbox
        {...args}
        checked={checked}
        onCheckedChange={(nextChecked) => setChecked(nextChecked === true)}
      />
    );
  },
  play: async ({ canvasElement }) => {
    await exerciseCheckboxStory({
      canvasElement,
      expectedLabel: checkboxFixtures.terms.accessibilityLabel,
    });
  },
};

export const States: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Checkbox defaultChecked {...checkboxFixtures.terms} />
      <Checkbox disabled {...checkboxFixtures.terms} />
    </div>
  ),
};
