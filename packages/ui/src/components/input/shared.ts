import type { TestProps } from "../../lib/test-props";

export type InputTestProps = TestProps;

export type InputClassNameOptions = InputTestProps & {
  className?: string | undefined;
};

export type NativeInputClassNameOptions = InputTestProps & {
  className?: string | undefined;
  editable?: boolean | undefined;
};
