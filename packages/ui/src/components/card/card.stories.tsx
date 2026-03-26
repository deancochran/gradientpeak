import type { Meta, StoryObj } from "@storybook/react";

import { Badge } from "../badge/index.web";
import { Button } from "../button/index.web";
import { cardFixtures } from "./fixtures";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./index.web";

const meta = {
  title: "Components/Card",
  component: Card,
  tags: ["autodocs"],
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <Card className="w-[360px]">
      <CardHeader>
        <CardTitle>{cardFixtures.recoveryCheck.title}</CardTitle>
        <CardDescription>{cardFixtures.recoveryCheck.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 text-sm">
          {cardFixtures.recoveryCheck.stats.map((stat) => (
            <div
              className="flex items-center justify-between rounded-lg border px-3 py-2"
              key={stat.label}
            >
              <span className="text-muted-foreground">{stat.label}</span>
              <span className="font-medium">{stat.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full">{cardFixtures.recoveryCheck.primaryActionLabel}</Button>
      </CardFooter>
    </Card>
  ),
};

export const WithAction: Story = {
  render: () => (
    <Card className="w-[360px]">
      <CardHeader>
        <CardTitle>Tempo session</CardTitle>
        <CardDescription>Tomorrow at 6:30 AM</CardDescription>
        <CardAction>
          <Badge variant="secondary">On track</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        3 x 10 minutes at threshold effort with 2-minute recovery jogs between repeats.
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="ghost">Skip</Button>
        <Button>Open workout</Button>
      </CardFooter>
    </Card>
  ),
};
