"use client";

import * as React from "react";

import { Switch as RegistrySwitch } from "../../registry/web/switch";
import { getWebTestProps } from "../../lib/test-props";
import type { SwitchTestProps } from "./shared";

function Switch({
  accessibilityLabel,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof RegistrySwitch> & SwitchTestProps) {
  return (
    <RegistrySwitch {...getWebTestProps({ accessibilityLabel, id, role, testId })} {...props} />
  );
}

export { Switch };
