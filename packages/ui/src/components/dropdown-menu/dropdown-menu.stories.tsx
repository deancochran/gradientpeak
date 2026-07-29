import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "@storybook/test";

import { Button } from "../button/index.web";
import { dropdownMenuFixtures } from "./fixtures";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./index.web";
import { exerciseDropdownMenuStory } from "./interactions";

const meta = {
  title: "Components/DropdownMenu",
  component: DropdownMenu,
  tags: ["autodocs"],
} satisfies Meta<typeof DropdownMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline">
          {dropdownMenuFixtures.activityActions.triggerLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>{dropdownMenuFixtures.activityActions.duplicateLabel}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          {dropdownMenuFixtures.activityActions.deleteLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  play: async ({ canvasElement }) => {
    const { trigger } = await exerciseDropdownMenuStory({
      canvasElement,
      itemLabel: dropdownMenuFixtures.activityActions.deleteLabel,
      triggerLabel: dropdownMenuFixtures.activityActions.triggerLabel,
    });

    await expect(trigger).toBeVisible();
  },
};
