import { expect, fireEvent, userEvent, within } from "@storybook/test";

export async function exerciseWeightInputFieldStory({
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
  const poundsButton = canvas.getByRole("button", { name: "LBS" });

  await expect(input).toBeVisible();
  fireEvent.change(input, { target: { value: nextValue } });
  fireEvent.blur(input);
  await userEvent.click(poundsButton);

  return { input, poundsButton };
}
