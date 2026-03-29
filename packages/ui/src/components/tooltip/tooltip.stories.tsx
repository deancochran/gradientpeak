import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "../button/index.web";
import { tooltipFixtures } from "./fixtures";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./index.web";

const meta = {
  title: "Components/Tooltip",
  component: Tooltip,
  tags: ["autodocs"],
} satisfies Meta<typeof Tooltip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="outline">
            {tooltipFixtures.help.triggerLabel}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltipFixtures.help.content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};
