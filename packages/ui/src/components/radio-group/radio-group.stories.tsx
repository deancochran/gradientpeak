import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { Label } from "../label/index.web";
import { radioGroupFixtures } from "./fixtures";
import { RadioGroup, RadioGroupItem } from "./index.web";
import { exerciseRadioGroupStory } from "./interactions";

const meta = {
  title: "Components/RadioGroup",
  component: RadioGroup,
  tags: ["autodocs"],
} satisfies Meta<typeof RadioGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => {
    const [value, setValue] = useState<string>(radioGroupFixtures.sport.value);

    return (
      <RadioGroup
        id={radioGroupFixtures.sport.id}
        onValueChange={(nextValue) => setValue(nextValue)}
        testId={radioGroupFixtures.sport.testId}
        value={value}
      >
        {radioGroupFixtures.sport.options.map((option) => (
          <div key={option.value} className="flex items-center gap-2">
            <RadioGroupItem
              id={`${radioGroupFixtures.sport.id}-${option.value}`}
              value={option.value}
            />
            <Label htmlFor={`${radioGroupFixtures.sport.id}-${option.value}`}>{option.label}</Label>
          </div>
        ))}
      </RadioGroup>
    );
  },
  play: async ({ canvasElement }) => {
    await exerciseRadioGroupStory({
      canvasElement,
      nextOptionLabel: radioGroupFixtures.sport.options[0].label,
    });
  },
};
