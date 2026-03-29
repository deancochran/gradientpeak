import type { Meta, StoryObj } from "@storybook/react";

import { Card, CardContent, CardHeader, CardTitle } from "../card/index.web";
import { separatorFixtures } from "./fixtures";
import { Separator } from "./index.web";

const meta = {
  title: "Components/Separator",
  component: Separator,
  tags: ["autodocs"],
  args: {
    ...separatorFixtures.section,
    decorative: false,
  },
} satisfies Meta<typeof Separator>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <Card className="w-[360px]">
      <CardHeader>
        <CardTitle>Weekly overview</CardTitle>
      </CardHeader>
      <Separator {...args} />
      <CardContent className="pt-4 text-sm text-muted-foreground">
        Aerobic load is trending upward.
      </CardContent>
    </Card>
  ),
};
