import type { Meta, StoryObj } from "@storybook/react";

import { Card, CardContent } from "../card/index.web";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./index.web";
import type { TabsListVariant } from "./shared";

const meta = {
  title: "Components/Tabs",
  component: Tabs,
  tags: ["autodocs"],
} satisfies Meta<typeof Tabs>;

export default meta;

type Story = StoryObj<typeof meta>;

function TabsPreview({ variant }: { variant: TabsListVariant }) {
  return (
    <Tabs className="w-[420px]" defaultValue="overview">
      <TabsList variant={variant}>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="sessions">Sessions</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Base block is progressing well, with fatigue trending down after the
            recovery week.
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="sessions">
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Four key sessions are scheduled this week: hills, tempo, recovery
            spin, and long run.
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="notes">
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Prioritize sleep and avoid stacking strength work the night before
            the tempo session.
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

export const Default: Story = {
  render: () => <TabsPreview variant="default" />,
};

export const Line: Story = {
  render: () => <TabsPreview variant="line" />,
};
