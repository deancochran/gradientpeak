import { expect, userEvent, within } from "@storybook/test";

export async function exerciseAccordionStory({
  canvasElement,
  sectionTitle,
}: {
  canvasElement: HTMLElement;
  sectionTitle: string;
}) {
  const canvas = within(canvasElement);
  const trigger = canvas.getByRole("button", { name: sectionTitle });

  await expect(trigger).toBeVisible();
  await userEvent.click(trigger);

  return { trigger };
}
