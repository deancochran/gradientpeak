import { expect, userEvent, within } from "@storybook/test";

export async function exerciseIntegerStepperStory({
  canvasElement,
  expectedLabel,
}: {
  canvasElement: HTMLElement;
  expectedLabel: string;
}) {
  const canvas = within(canvasElement);
  const input = canvas.getByRole("textbox", { name: expectedLabel });
  const incrementButton = canvas.getByRole("button", { name: "+" });

  await expect(input).toBeVisible();
  await userEvent.click(incrementButton);

  return { incrementButton, input };
}
