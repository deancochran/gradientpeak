import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { paceSecondsFieldFixtures } from "./fixtures";
import { PaceSecondsField } from "./index.web";

const meta = {
  title: "Components/PaceSecondsField",
  component: PaceSecondsField,
  tags: ["autodocs"],
  args: {
    ...paceSecondsFieldFixtures.easy,
    onChangeSeconds: () => {},
  },
} satisfies Meta<typeof PaceSecondsField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [valueSeconds, setValueSeconds] = useState<number | null>(
      paceSecondsFieldFixtures.easy.valueSeconds,
    );
    return (
      <PaceSecondsField {...args} onChangeSeconds={setValueSeconds} valueSeconds={valueSeconds} />
    );
  },
};
