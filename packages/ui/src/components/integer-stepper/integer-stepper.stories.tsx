import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { integerStepperFixtures } from "./fixtures";
import { IntegerStepper } from "./index.web";

const meta = {
  title: "Components/IntegerStepper",
  component: IntegerStepper,
  tags: ["autodocs"],
  args: {
    ...integerStepperFixtures.weeks,
    onChange: () => {},
  },
} satisfies Meta<typeof IntegerStepper>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState<number>(integerStepperFixtures.weeks.value);
    return <IntegerStepper {...args} onChange={setValue} value={value} />;
  },
};
