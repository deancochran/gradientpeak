import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "@storybook/test";

import { Button } from "../button/index.web";
import { alertDialogFixtures } from "./fixtures";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./index.web";
import { exerciseAlertDialogStory } from "./interactions";

const meta = {
  title: "Components/AlertDialog",
  component: AlertDialog,
  tags: ["autodocs"],
} satisfies Meta<typeof AlertDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline">
          Open dialog
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent testId={alertDialogFixtures.confirmDelete.testId}>
        <AlertDialogHeader>
          <AlertDialogTitle>{alertDialogFixtures.confirmDelete.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {alertDialogFixtures.confirmDelete.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>{alertDialogFixtures.confirmDelete.actionLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
  play: async ({ canvasElement }) => {
    const { dialog } = await exerciseAlertDialogStory({
      actionLabel: alertDialogFixtures.confirmDelete.actionLabel,
      canvasElement,
      triggerLabel: "Open dialog",
    });

    await expect(dialog).not.toBeVisible();
  },
};
