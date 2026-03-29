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
          {dropdownMenuFixtures.workoutActions.triggerLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>{dropdownMenuFixtures.workoutActions.duplicateLabel}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          {dropdownMenuFixtures.workoutActions.deleteLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  play: async ({ canvasElement }) => {
    const { trigger } = await exerciseDropdownMenuStory({
      canvasElement,
      itemLabel: dropdownMenuFixtures.workoutActions.deleteLabel,
      triggerLabel: dropdownMenuFixtures.workoutActions.triggerLabel,
    });

    await expect(trigger).toBeVisible();
  },
};
