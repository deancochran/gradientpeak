import type { Meta, StoryObj } from "@storybook/react";

import { Card, CardContent } from "../card/index.web";
import { tabsFixtures } from "./fixtures";
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
  const fixture = tabsFixtures.settings;

  return (
    <Tabs className="w-[420px]" defaultValue={fixture.values.overview}>
      <TabsList variant={variant}>
        <TabsTrigger value={fixture.values.overview}>
          {fixture.triggers.overview.label}
        </TabsTrigger>
        <TabsTrigger value={fixture.values.sessions}>
          {fixture.triggers.sessions.label}
        </TabsTrigger>
        <TabsTrigger value={fixture.values.notes}>
          {fixture.triggers.notes.label}
        </TabsTrigger>
      </TabsList>
      <TabsContent value={fixture.values.overview}>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {fixture.content.overview}
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value={fixture.values.sessions}>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {fixture.content.sessions}
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value={fixture.values.notes}>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {fixture.content.notes}
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
