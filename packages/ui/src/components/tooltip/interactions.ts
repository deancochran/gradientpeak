import { expect, userEvent, within } from "@storybook/test";

export async function exerciseTooltipStory({
  canvasElement,
  content,
  triggerLabel,
}: {
  canvasElement: HTMLElement;
  content: string;
  triggerLabel: string;
}) {
  const canvas = within(canvasElement);
  const trigger = canvas.getByRole("button", { name: triggerLabel });

  await expect(trigger).toBeVisible();
  await userEvent.hover(trigger);

  const tooltip = within(document.body).getByText(content);
  await expect(tooltip).toBeVisible();

  return { tooltip, trigger };
}
