import * as React from "react";
import { getNativeTestProps } from "../../lib/test-props";
import { Checkbox as RegistryCheckbox } from "../../registry/native/checkbox";
import type { CheckboxClassNameOverrides, CheckboxTestProps } from "./shared";

function Checkbox({
  accessibilityLabel,
  id,
  testId,
  ...props
}: Omit<React.ComponentProps<typeof RegistryCheckbox>, "nativeID" | "testID"> &
  CheckboxClassNameOverrides &
  CheckboxTestProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    testId,
  });

  return <RegistryCheckbox {...nativeTestProps} {...props} />;
}

export { Checkbox };
