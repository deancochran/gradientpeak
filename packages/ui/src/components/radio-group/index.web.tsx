"use client";

import * as React from "react";

import { RadioGroup as RegistryRadioGroup, RadioGroupItem } from "../../registry/web/radio-group";
import { getWebTestProps } from "../../lib/test-props";
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
