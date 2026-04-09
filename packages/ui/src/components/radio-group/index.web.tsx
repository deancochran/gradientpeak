"use client";

import * as React from "react";
import { getWebTestProps } from "../../lib/test-props";
import { RadioGroupItem, RadioGroup as RegistryRadioGroup } from "../../registry/web/radio-group";
import type { RadioGroupTestProps } from "./shared";

function RadioGroup({
  accessibilityLabel,
  id,
  testId,
  ...props
}: React.ComponentProps<typeof RegistryRadioGroup> & RadioGroupTestProps) {
  return <RegistryRadioGroup {...getWebTestProps({ accessibilityLabel, id, testId })} {...props} />;
}

export { RadioGroup, RadioGroupItem };
