import * as React from "react";
import { getNativeTestProps } from "../../lib/test-props";
import { Separator as RegistrySeparator } from "../../registry/native/separator";
import type { SeparatorTestProps } from "./shared";

function Separator({
  accessibilityLabel,
  id,
  role,
  testId,
  ...props
}: Omit<React.ComponentProps<typeof RegistrySeparator>, "nativeID" | "testID"> &
  SeparatorTestProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  });

  return <RegistrySeparator {...nativeTestProps} {...props} />;
}

export { Separator };
