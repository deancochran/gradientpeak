import { expect, userEvent, within } from "@storybook/test";

export async function exerciseTabsStory({
  canvasElement,
  nextTabLabel,
  nextTabContent,
}: {
  canvasElement: HTMLElement;
  nextTabContent: string;
  nextTabLabel: string;
}) {
  const canvas = within(canvasElement);
  const nextTab = canvas.getByRole("tab", { name: nextTabLabel });

  await expect(nextTab).toBeVisible();
  await userEvent.click(nextTab);
  await expect(nextTab).toHaveAttribute("data-state", "active");
  await expect(canvas.getByText(nextTabContent)).toBeVisible();

  return { nextTab };
}
