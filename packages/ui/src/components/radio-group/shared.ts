import type { TestProps } from "../../lib/test-props";

export type RadioGroupTestProps = Omit<TestProps, "role">;

export type RadioGroupItemClassNameOverrides = {
  className?: string;
};
