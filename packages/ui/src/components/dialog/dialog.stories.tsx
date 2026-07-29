import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "@storybook/test";

import { Button } from "../button/index.web";
import { dialogFixtures } from "./fixtures";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./index.web";
import { exerciseDialogStory } from "./interactions";

const meta = {
  title: "Components/Dialog",
  component: Dialog,
  tags: ["autodocs"],
} satisfies Meta<typeof Dialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          {dialogFixtures.activityDetails.triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{dialogFixtures.activityDetails.title}</DialogTitle>
          <DialogDescription>{dialogFixtures.activityDetails.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton>{null}</DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  play: async ({ canvasElement }) => {
    const { dialog } = await exerciseDialogStory({
      canvasElement,
      closeLabel: dialogFixtures.activityDetails.closeLabel,
      triggerLabel: dialogFixtures.activityDetails.triggerLabel,
    });

    await expect(dialog).not.toBeVisible();
  },
};
