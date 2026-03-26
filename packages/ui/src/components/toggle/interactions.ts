import { expect, userEvent, within } from "@storybook/test";

export async function exerciseToggleStory({
  canvasElement,
  expectedLabel,
}: {
  canvasElement: HTMLElement;
  expectedLabel: string;
}) {
  const canvas = within(canvasElement);
  const toggle = canvas.getByRole("button", { name: expectedLabel });

  await expect(toggle).toBeVisible();
  await userEvent.click(toggle);

  return { toggle };
}
