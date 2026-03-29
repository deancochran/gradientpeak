import { expect, userEvent, within } from "@storybook/test";

export async function exerciseButtonStory({
  canvasElement,
  expectedLabel,
}: {
  canvasElement: HTMLElement;
  expectedLabel: string;
}) {
  const canvas = within(canvasElement);
  const button = canvas.getByRole("button", { name: expectedLabel });

  await expect(button).toBeVisible();
  await userEvent.click(button);

  return { button };
}
