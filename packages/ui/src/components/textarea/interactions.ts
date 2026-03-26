import { expect, fireEvent, within } from "@storybook/test";

export async function exerciseTextareaStory({
  canvasElement,
  expectedLabel,
  nextValue,
}: {
  canvasElement: HTMLElement;
  expectedLabel: string;
  nextValue: string;
}) {
  const canvas = within(canvasElement);
  const textarea = canvas.getByRole("textbox", { name: expectedLabel });

  await expect(textarea).toBeVisible();
  fireEvent.change(textarea, { target: { value: nextValue } });
  await expect(textarea).toHaveValue(nextValue);

  return { textarea };
}
