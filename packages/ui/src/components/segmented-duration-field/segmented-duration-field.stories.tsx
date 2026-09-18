import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { Button } from "../button/index.web";
import { segmentedDurationFixtures } from "./fixtures";
import { SegmentedDurationField, type SegmentedDurationFieldProps } from "./index.web";
import { type DurationSegments, parseDurationSegments, splitDurationSeconds } from "./shared";

function ControlledDuration(args: SegmentedDurationFieldProps) {
  const [seconds, setSeconds] = useState(args.valueSeconds);
  const [segments, setSegments] = useState<DurationSegments>(
    () => args.segments ?? splitDurationSeconds(args.valueSeconds),
  );
  const [invalid, setInvalid] = useState(parseDurationSegments(segments) === null);
  return (
    <div className="max-w-md space-y-4 bg-background p-6 text-foreground">
      <SegmentedDurationField
        {...args}
        valueSeconds={seconds}
        segments={segments}
        onSegmentsChange={(next) => {
          setSegments(next);
          args.onSegmentsChange?.(next);
        }}
        onChangeSeconds={(next) => {
          setSeconds(next);
          args.onChangeSeconds(next);
        }}
        onInvalidChange={(next) => {
          setInvalid(next);
          args.onInvalidChange(next);
        }}
      />
      <output aria-label="Committed duration" className="block text-sm">
        {seconds} seconds
      </output>
      <p role="status" className="text-sm">
        {invalid ? "Incomplete draft — last valid duration retained." : "Valid duration."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={args.disabled}
          onClick={() => setSegments({ ...segments, seconds: "" })}
        >
          Restore incomplete time
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={args.disabled}
          onClick={() => {
            setSeconds(180);
            setSegments(splitDurationSeconds(180));
          }}
        >
          Reset to 3 minutes
        </Button>
      </div>
    </div>
  );
}

const meta = {
  title: "Components/SegmentedDurationField",
  component: SegmentedDurationField,
  tags: ["autodocs"],
  args: { ...segmentedDurationFixtures.short, onChangeSeconds: fn(), onInvalidChange: fn() },
  render: (args) => <ControlledDuration {...args} />,
} satisfies Meta<typeof SegmentedDurationField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const minutes = canvas.getByRole("textbox", { name: "Duration minutes" });
    await userEvent.clear(minutes);
    await userEvent.type(minutes, "4");
    await expect(args.onChangeSeconds).toHaveBeenLastCalledWith(240);
    await expect(canvas.getByLabelText("Committed duration")).toHaveTextContent("240 seconds");
    await userEvent.click(canvas.getByRole("button", { name: "Restore incomplete time" }));
    await expect(canvas.getByRole("textbox", { name: "Duration seconds" })).toHaveValue("");
    await expect(args.onInvalidChange).toHaveBeenLastCalledWith(true);
    await expect(canvas.getByLabelText("Committed duration")).toHaveTextContent("240 seconds");
    await userEvent.click(canvas.getByRole("button", { name: "Reset to 3 minutes" }));
    await expect(args.onInvalidChange).toHaveBeenLastCalledWith(false);
    await expect(canvas.getByLabelText("Committed duration")).toHaveTextContent("180 seconds");
  },
};
export const LongDuration: Story = { args: segmentedDurationFixtures.long };
export const IncompleteDraft: Story = { args: segmentedDurationFixtures.incomplete };
export const DisabledDayLimit: Story = { args: segmentedDurationFixtures.disabled };
