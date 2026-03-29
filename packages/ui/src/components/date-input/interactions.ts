import { expect, fireEvent, within } from "@storybook/test";

export async function exerciseDateInputStory({
  canvasElement,
  expectedLabel,
  nextValue,
}: {
  canvasElement: HTMLElement;
  expectedLabel: string;
  nextValue: string;
}) {
  const canvas = within(canvasElement);
  const input = canvas.getByLabelText(expectedLabel);

  await expect(input).toBeVisible();
  fireEvent.change(input, { target: { value: nextValue } });
  await expect(input).toHaveValue(nextValue);

  return { input };
}
