import { expect, userEvent, within } from "@storybook/test";

export async function exerciseSelectStory({
  canvasElement,
  nextOptionLabel,
  placeholder,
}: {
  canvasElement: HTMLElement;
  nextOptionLabel: string;
  placeholder: string;
}) {
  const canvas = within(canvasElement);
  const trigger = canvas.getByRole("combobox");

  await expect(trigger).toBeVisible();
  await expect(trigger).not.toHaveTextContent(placeholder);
  await userEvent.click(trigger);

  const option = within(document.body).getByRole("option", { name: nextOptionLabel });
  await userEvent.click(option);

  await expect(trigger).toHaveTextContent(nextOptionLabel);

  return { option, trigger };
}
