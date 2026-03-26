import { expect, userEvent, within } from "@storybook/test";

export async function exerciseDropdownMenuStory({
  canvasElement,
  itemLabel,
  triggerLabel,
}: {
  canvasElement: HTMLElement;
  itemLabel: string;
  triggerLabel: string;
}) {
  const canvas = within(canvasElement);
  const trigger = canvas.getByRole("button", { name: triggerLabel });

  await expect(trigger).toBeVisible();
  await userEvent.click(trigger);

  const item = within(document.body).getByRole("menuitem", { name: itemLabel });
  await userEvent.click(item);

  return { item, trigger };
}
