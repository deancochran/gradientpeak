import { expect, userEvent, within } from "@storybook/test";

export async function exerciseToggleGroupStory({
  canvasElement,
  optionLabel,
}: {
  canvasElement: HTMLElement;
  optionLabel: string;
}) {
  const canvas = within(canvasElement);
  const option = canvas.getByRole("radio", { name: optionLabel });

  await expect(option).toBeVisible();
  await userEvent.click(option);

  return { option };
}
