import type { Meta, StoryObj } from "@storybook/react";
import { within } from "@storybook/test";

import { inputFixtures } from "./fixtures";
import { Input } from "./index.web";
import { exerciseInputStory } from "./interactions";

const meta = {
  title: "Components/Input",
  component: Input,
  tags: ["autodocs"],
  args: {
    ...inputFixtures.email,
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
  play: async ({ canvasElement }) => {
    const nextValue = "builder@gradientpeak.app";

    await exerciseInputStory({
      canvasElement,
      expectedLabel: inputFixtures.email.accessibilityLabel,
      nextValue,
    });

    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", {
      name: inputFixtures.email.accessibilityLabel,
    });

    input.blur();
  },
};

export const States: Story = {
  render: () => (
    <div className="grid w-80 gap-4">
      <Input placeholder={inputFixtures.states.defaultPlaceholder} />
      <Input defaultValue={inputFixtures.states.value} />
      <Input aria-invalid defaultValue={inputFixtures.states.invalidValue} />
      <Input disabled defaultValue={inputFixtures.states.disabledValue} />
    </div>
  ),
};
