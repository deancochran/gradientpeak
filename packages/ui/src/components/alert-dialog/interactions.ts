import { expect, userEvent, within } from "@storybook/test";

export async function exerciseAlertDialogStory({
  actionLabel,
  canvasElement,
  triggerLabel,
}: {
  actionLabel: string;
  canvasElement: HTMLElement;
  triggerLabel: string;
}) {
  const canvas = within(canvasElement);
  const trigger = canvas.getByRole("button", { name: triggerLabel });

  await expect(trigger).toBeVisible();
  await userEvent.click(trigger);

  const dialog = within(document.body).getByRole("alertdialog");
  await expect(dialog).toBeVisible();

  const action = within(document.body).getByRole("button", { name: actionLabel });
  await userEvent.click(action);

  return { action, dialog, trigger };
}
