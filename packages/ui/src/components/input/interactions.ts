import { expect, userEvent, within } from "@storybook/test";

export async function exerciseInputStory({
  canvasElement,
  nextValue,
  expectedLabel,
}: {
  canvasElement: HTMLElement;
  nextValue: string;
  expectedLabel: string;
}) {
  const canvas = within(canvasElement);
  const input = canvas.getByRole("textbox", { name: expectedLabel });

  await expect(input).toBeVisible();
  await userEvent.clear(input);
  await userEvent.type(input, nextValue);
  await expect(input).toHaveValue(nextValue);

  return { input };
}
