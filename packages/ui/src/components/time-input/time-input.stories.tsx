import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";

import { timeInputFixtures } from "./fixtures";
import { TimeInput } from "./index.web";

const meta = {
  title: "Components/TimeInput",
  component: TimeInput,
  args: {
    ...timeInputFixtures.startTime,
    onChange: () => {},
  },
} satisfies Meta<typeof TimeInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = React.useState<string | undefined>(timeInputFixtures.startTime.value);

    return <TimeInput {...args} onChange={setValue} value={value} />;
  },
};
