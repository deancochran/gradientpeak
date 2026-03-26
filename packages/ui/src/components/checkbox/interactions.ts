import { expect, userEvent, within } from "@storybook/test";

export async function exerciseCheckboxStory({
  canvasElement,
  expectedLabel,
}: {
  canvasElement: HTMLElement;
  expectedLabel: string;
}) {
  const canvas = within(canvasElement);
  const checkbox = canvas.getByRole("checkbox", { name: expectedLabel });

  await expect(checkbox).toBeVisible();
  await expect(checkbox).toHaveAttribute("data-state", "checked");
  await userEvent.click(checkbox);
  await expect(checkbox).toHaveAttribute("data-state", "unchecked");

  return { checkbox };
}
