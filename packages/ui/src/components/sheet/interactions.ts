import { expect, userEvent, within } from "@storybook/test";

export async function exerciseSheetStory({
  canvasElement,
  closeLabel,
  triggerLabel,
}: {
  canvasElement: HTMLElement;
  closeLabel: string;
  triggerLabel: string;
}) {
  const canvas = within(canvasElement);
  const trigger = canvas.getByRole("button", { name: triggerLabel });

  await expect(trigger).toBeVisible();
  await userEvent.click(trigger);

  const sheet = within(document.body).getByRole("dialog");
  await expect(sheet).toBeVisible();

  const closeButton = within(document.body).getByRole("button", { name: closeLabel });
  await userEvent.click(closeButton);

  return { closeButton, sheet, trigger };
}
