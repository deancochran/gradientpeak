"use client";

import * as React from "react";

import { Label as RegistryLabel } from "../../registry/web/label";
import { getWebTestProps } from "../../lib/test-props";
import type { TestProps } from "../../lib/test-props";

function Label({
  accessibilityLabel,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof RegistryLabel> & TestProps) {
  return (
    <RegistryLabel {...getWebTestProps({ accessibilityLabel, id, role, testId })} {...props} />
  );
}

export { Label };
