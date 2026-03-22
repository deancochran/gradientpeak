import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { dateInputFixtures } from "./fixtures";
import { DateInput } from "./index.web";

const meta = {
  title: "Components/DateInput",
  component: DateInput,
  tags: ["autodocs"],
  args: {
    ...dateInputFixtures.raceDay,
    onChange: () => {},
  },
} satisfies Meta<typeof DateInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState<string | undefined>(dateInputFixtures.raceDay.value);
    return <DateInput {...args} onChange={setValue} value={value} />;
  },
};
