import { expect, fireEvent, within } from "@storybook/test";

export async function exercisePaceSecondsFieldStory({
  canvasElement,
  expectedLabel,
  nextValue,
}: {
  canvasElement: HTMLElement;
  expectedLabel: string;
  nextValue: string;
}) {
  const canvas = within(canvasElement);
  const input = canvas.getByRole("textbox", { name: expectedLabel });

  await expect(input).toBeVisible();
  fireEvent.change(input, { target: { value: nextValue } });
  fireEvent.blur(input);
  await expect(input).toHaveValue(nextValue);

  return { input };
}
