import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "../button/index.native";
import { Text } from "../text/index.native";
import { segmentedDurationFixtures } from "./fixtures";
import { SegmentedDurationField, type SegmentedDurationFieldProps } from "./index.native";
import { type DurationSegments, parseDurationSegments, splitDurationSeconds } from "./shared";

function ControlledDuration(args: SegmentedDurationFieldProps) {
  const [seconds, setSeconds] = useState(args.valueSeconds);
  const [segments, setSegments] = useState<DurationSegments>(
    () => args.segments ?? splitDurationSeconds(args.valueSeconds, args.layout),
  );
  const [invalid, setInvalid] = useState(
    args.valueSeconds == null
      ? (args.required ?? true)
      : parseDurationSegments(segments, args) === null,
  );
  return (
    <View className="gap-4 bg-background p-6">
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
        onEmpty={() => {
          setSeconds(null);
          args.onEmpty?.();
        }}
        onInvalidChange={(next) => {
          setInvalid(next);
          args.onInvalidChange(next);
        }}
      />
      <Text
        accessibilityLabel={`Committed duration: ${seconds == null ? "Not set" : `${seconds} seconds`}`}
      >
        {seconds == null ? "Not set" : `${seconds} seconds`}
      </Text>
      <Text accessibilityLiveRegion="polite">
        {invalid ? "Incomplete draft — last valid duration retained." : "Valid duration."}
      </Text>
      <Button
        variant="outline"
        disabled={args.disabled}
        onPress={() =>
          setSegments({ ...segments, [args.layout === "hm" ? "minutes" : "seconds"]: "bad" })
        }
      >
        <Text>Restore incomplete time</Text>
      </Button>
      <Button
        variant="outline"
        disabled={args.disabled}
        onPress={() => {
          setSeconds(180);
          setSegments(splitDurationSeconds(180, args.layout));
        }}
      >
        <Text>Reset to 3 minutes</Text>
      </Button>
    </View>
  );
}

const meta = {
  title: "Inputs/SegmentedDurationField/Native",
  component: SegmentedDurationField,
  args: {
    ...segmentedDurationFixtures.short,
    maxSeconds: 86400,
    onChangeSeconds: () => {},
    onInvalidChange: () => {},
  },
  render: (args) => <ControlledDuration {...args} />,
} satisfies Meta<typeof SegmentedDurationField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
export const NativePickers: Story = { args: { presentation: "native" } };
export const NativeDayLimit: Story = {
  args: { ...segmentedDurationFixtures.dayLimit, presentation: "native" },
};
export const ZeroDurationNeedsCorrection: Story = {
  args: { ...segmentedDurationFixtures.zero, presentation: "native" },
};
export const NativeInvalid: Story = {
  args: { ...segmentedDurationFixtures.incomplete, presentation: "native" },
};
export const LongDuration: Story = { args: segmentedDurationFixtures.long };
export const IncompleteDraft: Story = { args: segmentedDurationFixtures.incomplete };
export const DisabledDayLimit: Story = { args: segmentedDurationFixtures.disabled };
export const GoalBeyondDay: Story = { args: { valueSeconds: 90001, maxSeconds: undefined } };
export const WholeMinuteBudget: Story = {
  args: {
    label: "Weekly duration",
    layout: "hm",
    valueSeconds: 9000,
    minSeconds: 60,
    maxSeconds: 604800,
    granularitySeconds: 60,
    required: false,
    allowOmittedSegments: true,
  },
};
