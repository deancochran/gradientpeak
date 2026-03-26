import { expect, userEvent, within } from "@storybook/test";

export async function exerciseSwitchStory({
  canvasElement,
  expectedLabel,
}: {
  canvasElement: HTMLElement;
  expectedLabel: string;
}) {
  const canvas = within(canvasElement);
  const control = canvas.getByRole("switch", { name: expectedLabel });

  await expect(control).toBeVisible();
  await expect(control).toHaveAttribute("data-state", "checked");
  await userEvent.click(control);
  await expect(control).toHaveAttribute("data-state", "unchecked");

  return { control };
}
