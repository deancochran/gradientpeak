import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "@storybook/test";
import { useState } from "react";

import { toggleGroupFixtures } from "./fixtures";
import { ToggleGroup, ToggleGroupItem } from "./index.web";
import { exerciseToggleGroupStory } from "./interactions";

const meta = {
  title: "Components/ToggleGroup",
  component: ToggleGroup,
  tags: ["autodocs"],
  args: {
    type: "single",
  },
} satisfies Meta<typeof ToggleGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    type: "single",
  },
  render: () => {
    const [value, setValue] = useState(toggleGroupFixtures.viewMode.value);

    return (
      <ToggleGroup
        aria-label={toggleGroupFixtures.viewMode.ariaLabel}
        onValueChange={(nextValue) => setValue(nextValue)}
        testId={toggleGroupFixtures.viewMode.rootTestId}
        type="single"
        value={value}
      >
        {toggleGroupFixtures.viewMode.options.map((option) => (
          <ToggleGroupItem key={option.value} testId={option.testId} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    );
  },
  play: async ({ canvasElement }) => {
    const nextOption = toggleGroupFixtures.viewMode.options[1];
    if (!nextOption) return;

    const { option } = await exerciseToggleGroupStory({
      canvasElement,
      optionLabel: nextOption.label,
    });

    await expect(option).toHaveAttribute("aria-checked", "true");
  },
};
