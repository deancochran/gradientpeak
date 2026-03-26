import { expect, fireEvent, within } from "@storybook/test";

export async function exerciseCommandStory({
  canvasElement,
  query,
}: {
  canvasElement: HTMLElement;
  query: string;
}) {
  const canvas = within(canvasElement);
  const input = canvas.getByRole("combobox");

  await expect(input).toBeVisible();
  fireEvent.change(input, { target: { value: query } });

  return { input };
}
