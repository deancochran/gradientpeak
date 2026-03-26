import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { selectFixtures } from "./fixtures";
import {
  NativeSelectScrollView,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./index.web";
import { exerciseSelectStory } from "./interactions";

const meta = {
  title: "Components/Select",
  component: Select,
  tags: ["autodocs"],
} satisfies Meta<typeof Select>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => {
    const [value, setValue] = useState<string>(selectFixtures.workoutType.value);

    return (
      <div className="w-80">
        <Select onValueChange={(nextValue) => setValue(nextValue)} value={value}>
          <SelectTrigger
            id={selectFixtures.workoutType.id}
            testId={selectFixtures.workoutType.testId}
          >
            <SelectValue placeholder={selectFixtures.workoutType.placeholder} />
          </SelectTrigger>
          <SelectContent>
            <NativeSelectScrollView>
              {selectFixtures.workoutType.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </NativeSelectScrollView>
          </SelectContent>
        </Select>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const firstOption = selectFixtures.workoutType.options[0];

    await exerciseSelectStory({
      canvasElement,
      nextOptionLabel: firstOption ? firstOption.label : "Endurance",
      placeholder: selectFixtures.workoutType.placeholder,
    });
  },
};
