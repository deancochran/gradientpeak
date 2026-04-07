import * as React from "react";

import { Toggle as RegistryToggle, ToggleIcon, toggleVariants } from "../../registry/native/toggle";
import { getNativeTestProps } from "../../lib/test-props";
import type { ToggleSize, ToggleTestProps, ToggleVariant } from "./shared";

function Toggle({
  accessibilityLabel,
  id,
  role,
  size,
  testId,
  variant,
  ...props
}: Omit<React.ComponentProps<typeof RegistryToggle>, "nativeID" | "testID"> &
  ToggleTestProps & {
    size?: ToggleSize;
    variant?: ToggleVariant;
  }) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  });

  return <RegistryToggle {...nativeTestProps} size={size} variant={variant} {...props} />;
}

export type { ToggleSize, ToggleVariant };
export { Toggle, ToggleIcon, toggleVariants };
