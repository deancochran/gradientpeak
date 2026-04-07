import * as React from "react";

import { Checkbox as RegistryCheckbox } from "../../registry/native/checkbox";
import { getNativeTestProps } from "../../lib/test-props";
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
