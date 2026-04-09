import * as React from "react";
import { getNativeTestProps } from "../../lib/test-props";
import { Label as RegistryLabel } from "../../registry/native/label";
import type { LabelTestProps } from "./shared";

function Label({
  accessibilityLabel,
  id,
  nativeID,
  role,
  testId,
  testID,
  ...props
}: React.ComponentProps<typeof RegistryLabel> & LabelTestProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  });

  return (
    <RegistryLabel
      {...nativeTestProps}
      nativeID={nativeID ?? nativeTestProps.nativeID}
      testID={testID ?? nativeTestProps.testID}
      {...props}
    />
  );
}

export { Label };
