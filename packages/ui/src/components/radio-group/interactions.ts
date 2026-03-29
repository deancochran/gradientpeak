import { expect, userEvent, within } from "@storybook/test";

export async function exerciseRadioGroupStory({
  canvasElement,
  nextOptionLabel,
}: {
  canvasElement: HTMLElement;
  nextOptionLabel: string;
}) {
  const canvas = within(canvasElement);
  const radio = canvas.getByRole("radio", { name: nextOptionLabel });

  await expect(radio).toBeVisible();
  await userEvent.click(radio);
  await expect(radio).toBeChecked();

  return { radio };
}
