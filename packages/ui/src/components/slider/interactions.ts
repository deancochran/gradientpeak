import { expect, fireEvent, within } from "@storybook/test";

export async function exerciseSliderStory({
  canvasElement,
  expectedLabel,
  nextValue,
}: {
  canvasElement: HTMLElement;
  expectedLabel: string;
  nextValue: number;
}) {
  const canvas = within(canvasElement);
  const slider = canvas.getByRole("slider", { name: expectedLabel });

  await expect(slider).toBeVisible();
  fireEvent.change(slider, { target: { value: String(nextValue) } });
  await expect(slider).toHaveValue(String(nextValue));

  return { slider };
}
