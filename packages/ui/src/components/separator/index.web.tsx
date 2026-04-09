"use client";

import * as React from "react";
import { getWebTestProps } from "../../lib/test-props";
import { Separator as RegistrySeparator } from "../../registry/web/separator";
import type { SeparatorTestProps } from "./shared";

function Separator({
  accessibilityLabel,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof RegistrySeparator> & SeparatorTestProps) {
  return (
    <RegistrySeparator {...getWebTestProps({ accessibilityLabel, id, role, testId })} {...props} />
  );
}

export { Separator };
