import type { Meta, StoryObj } from "@storybook/react";

import { Label } from "../label/index.web";
import { radioGroupFixtures } from "./fixtures";
import { RadioGroup, RadioGroupItem } from "./index.web";

const meta = {
  title: "Components/RadioGroup",
  component: RadioGroup,
  tags: ["autodocs"],
} satisfies Meta<typeof RadioGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => (
    <RadioGroup
      defaultValue={radioGroupFixtures.sport.value}
      id={radioGroupFixtures.sport.id}
      testId={radioGroupFixtures.sport.testId}
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
  ),
};
