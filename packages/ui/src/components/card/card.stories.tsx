import type { Meta, StoryObj } from "@storybook/react";

import { Badge } from "../badge/index.web";
import { Button } from "../button/index.web";
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
        <CardTitle>Weekly recovery check</CardTitle>
        <CardDescription>
          Track energy, sleep quality, and workout confidence before your next
          block.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 text-sm">
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <span className="text-muted-foreground">Sleep score</span>
            <span className="font-medium">8.4 / 10</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <span className="text-muted-foreground">Resting HR</span>
            <span className="font-medium">52 bpm</span>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full">Save check-in</Button>
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
        3 x 10 minutes at threshold effort with 2-minute recovery jogs between
        repeats.
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="ghost">Skip</Button>
        <Button>Open workout</Button>
      </CardFooter>
    </Card>
  ),
};
