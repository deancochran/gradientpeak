import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "@storybook/test";

import { accordionFixtures } from "./fixtures";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./index.web";
import { exerciseAccordionStory } from "./interactions";

const meta = {
  title: "Components/Accordion",
  component: Accordion,
  tags: ["autodocs"],
  args: {
    type: "single",
  },
} satisfies Meta<typeof Accordion>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    type: "single",
  },
  render: () => (
    <Accordion collapsible defaultValue={accordionFixtures.settings.value} type="single">
      <AccordionItem
        testId={accordionFixtures.settings.testId}
        value={accordionFixtures.settings.value}
      >
        <AccordionTrigger>{accordionFixtures.settings.title}</AccordionTrigger>
        <AccordionContent>{accordionFixtures.settings.content}</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
  play: async ({ canvasElement }) => {
    const { trigger } = await exerciseAccordionStory({
      canvasElement,
      sectionTitle: accordionFixtures.settings.title,
    });

    await expect(trigger).toHaveAttribute("data-state", "closed");
  },
};
