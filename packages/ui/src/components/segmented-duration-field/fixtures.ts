import type { SegmentedDurationValueProps } from "./shared";

export const segmentedDurationFixtures = {
  short: { id: "segmented-duration-short", label: "Duration", valueSeconds: 180 },
  long: { id: "segmented-duration-long", label: "Duration", valueSeconds: 3661 },
  incomplete: {
    id: "segmented-duration-incomplete",
    label: "Duration",
    valueSeconds: 61,
    segments: { hours: "0", minutes: "1", seconds: "" },
  },
  disabled: {
    id: "segmented-duration-disabled",
    label: "Duration",
    valueSeconds: 86400,
    disabled: true,
  },
} satisfies Record<
  string,
  Omit<SegmentedDurationValueProps, "onChangeSeconds" | "onInvalidChange">
>;
