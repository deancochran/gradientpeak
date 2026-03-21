import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { boundedNumberInputFixtures } from "./fixtures";
import { BoundedNumberInput } from "./index.web";

const meta = {
  title: "Components/BoundedNumberInput",
  component: BoundedNumberInput,
  tags: ["autodocs"],
  args: {
    ...boundedNumberInputFixtures.ftp,
    onChange: () => {},
  },
} satisfies Meta<typeof BoundedNumberInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState<string>(boundedNumberInputFixtures.ftp.value);
    return <BoundedNumberInput {...args} onChange={setValue} value={value} />;
  },
};
