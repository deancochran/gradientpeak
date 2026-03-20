import type { TestProps } from "../../lib/test-props";

export type CheckboxTestProps = Omit<TestProps, "role">;

export type CheckboxClassNameOverrides = {
  checkedClassName?: string;
  indicatorClassName?: string;
  iconClassName?: string;
};
