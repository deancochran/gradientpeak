import type { TestProps } from "../../lib/test-props";

export type ProgressProps = Omit<TestProps, "role"> & {
  accessibilityLabel: string;
  className?: string;
  indicatorClassName?: string;
  value: number;
};

export function clampProgressValue(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
