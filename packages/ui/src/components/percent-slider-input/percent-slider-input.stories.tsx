import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { percentSliderInputFixtures } from "./fixtures";
import { PercentSliderInput } from "./index.web";

const meta = {
  title: "Components/PercentSliderInput",
  component: PercentSliderInput,
  tags: ["autodocs"],
  args: {
    ...percentSliderInputFixtures.recovery,
    onChange: () => {},
  },
} satisfies Meta<typeof PercentSliderInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState<number>(percentSliderInputFixtures.recovery.value);
    return <PercentSliderInput {...args} onChange={setValue} value={value} />;
  },
};
