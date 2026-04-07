"use client";

import * as React from "react";

import { Checkbox as RegistryCheckbox } from "../../registry/web/checkbox";
import { getWebTestProps } from "../../lib/test-props";
import type { CheckboxClassNameOverrides, CheckboxTestProps } from "./shared";

function Checkbox({
  accessibilityLabel,
  id,
  testId,
  ...props
}: React.ComponentProps<typeof RegistryCheckbox> & CheckboxClassNameOverrides & CheckboxTestProps) {
  return <RegistryCheckbox {...getWebTestProps({ accessibilityLabel, id, testId })} {...props} />;
}

export { Checkbox };
