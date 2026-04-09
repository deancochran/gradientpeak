import * as React from "react";
import { getNativeTestProps } from "../../lib/test-props";
import { Progress as RegistryProgress } from "../../registry/native/progress";
import type { ProgressProps as SharedProgressProps } from "./shared";

function Progress({
  accessibilityLabel,
  id,
  testId,
  ...props
}: Omit<React.ComponentProps<typeof RegistryProgress>, "nativeID" | "testID"> &
  SharedProgressProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    testId,
  });

  return <RegistryProgress {...nativeTestProps} {...props} />;
}

export { Progress };
