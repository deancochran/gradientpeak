import type { Meta, StoryObj } from "@storybook/react";

import { selectFixtures } from "./fixtures";
import {
  NativeSelectScrollView,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./index.web";

const meta = {
  title: "Components/Select",
  component: Select,
  tags: ["autodocs"],
} satisfies Meta<typeof Select>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => (
    <div className="w-80">
      <Select defaultValue={selectFixtures.workoutType.value}>
        <SelectTrigger>
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
  ),
};
