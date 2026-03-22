import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { durationInputFixtures } from "./fixtures";
import { DurationInput } from "./index.web";

const meta = {
  title: "Components/DurationInput",
  component: DurationInput,
  tags: ["autodocs"],
  args: {
    ...durationInputFixtures.workout,
    onChange: () => {},
  },
} satisfies Meta<typeof DurationInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState<string>(durationInputFixtures.workout.value);
    return <DurationInput {...args} onChange={setValue} value={value} />;
  },
};
