import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";

import { Card, CardContent } from "../card/index.web";
import { tabsFixtures } from "./fixtures";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./index.web";
import { exerciseTabsStory } from "./interactions";
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
    <Tabs className="w-[420px]" defaultValue={fixture.values.overview} testId={fixture.rootTestId}>
      <TabsList testId={fixture.listTestId} variant={variant}>
        <TabsTrigger testId={fixture.triggers.overview.testId} value={fixture.values.overview}>
          {fixture.triggers.overview.label}
        </TabsTrigger>
        <TabsTrigger testId={fixture.triggers.sessions.testId} value={fixture.values.sessions}>
          {fixture.triggers.sessions.label}
        </TabsTrigger>
        <TabsTrigger testId={fixture.triggers.notes.testId} value={fixture.values.notes}>
          {fixture.triggers.notes.label}
        </TabsTrigger>
      </TabsList>
      <TabsContent testId={fixture.contentTestIds.overview} value={fixture.values.overview}>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {fixture.content.overview}
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent testId={fixture.contentTestIds.sessions} value={fixture.values.sessions}>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {fixture.content.sessions}
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent testId={fixture.contentTestIds.notes} value={fixture.values.notes}>
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
  play: async ({ canvasElement }) => {
    const fixture = tabsFixtures.settings;

    await exerciseTabsStory({
      canvasElement,
      nextTabContent: fixture.content.sessions,
      nextTabLabel: fixture.triggers.sessions.label,
    });

    const canvas = within(canvasElement);
    await expect(canvas.getByTestId(fixture.contentTestIds.sessions)).toHaveTextContent(
      fixture.content.sessions,
    );
  },
};

export const Line: Story = {
  render: () => <TabsPreview variant="line" />,
};
