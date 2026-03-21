import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { paceInputFixtures } from "./fixtures";
import { PaceInput } from "./index.web";

const meta = {
  title: "Components/PaceInput",
  component: PaceInput,
  tags: ["autodocs"],
  args: {
    ...paceInputFixtures.threshold,
    onChange: () => {},
  },
} satisfies Meta<typeof PaceInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState<string>(paceInputFixtures.threshold.value);
    return <PaceInput {...args} onChange={setValue} value={value} />;
  },
};
