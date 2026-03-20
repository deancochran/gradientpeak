import type { TestProps } from "../../lib/test-props";

export type ProgressProps = Omit<TestProps, "role"> & {
  indicatorClassName?: string;
  value?: number | null;
};
