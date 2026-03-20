import type { TestProps } from "../../lib/test-props";

export type InputTestProps = TestProps;

export type InputClassNameOptions = InputTestProps & {
  className?: string;
};

export type NativeInputClassNameOptions = InputTestProps & {
  className?: string;
  editable?: boolean;
};
