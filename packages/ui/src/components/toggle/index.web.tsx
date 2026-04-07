"use client";

import * as React from "react";

import { Toggle as RegistryToggle, toggleVariants } from "../../registry/web/toggle";
import { getWebTestProps } from "../../lib/test-props";
import type { ToggleVariantOptions } from "./shared";

function Toggle({
  accessibilityLabel,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof RegistryToggle> & ToggleVariantOptions) {
  return (
    <RegistryToggle {...getWebTestProps({ accessibilityLabel, id, role, testId })} {...props} />
  );
}

export type { ToggleSize, ToggleVariant } from "./shared";
export { Toggle, toggleVariants };
