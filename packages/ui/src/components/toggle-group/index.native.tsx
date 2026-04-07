import * as React from "react";

import {
  ToggleGroup as RegistryToggleGroup,
  ToggleGroupIcon,
  ToggleGroupItem as RegistryToggleGroupItem,
} from "../../registry/native/toggle-group";
import { getNativeTestProps } from "../../lib/test-props";
import type { ToggleSize, ToggleVariant } from "../toggle/shared";
import type { ToggleGroupTestProps } from "./shared";

function ToggleGroup({
  accessibilityLabel,
  id,
  role,
  size,
  testId,
  variant,
  ...props
}: Omit<React.ComponentProps<typeof RegistryToggleGroup>, "nativeID" | "testID"> &
  ToggleGroupTestProps & {
    size?: ToggleSize;
    variant?: ToggleVariant;
  }) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  });

  return (
    <RegistryToggleGroup
      {...nativeTestProps}
      size={size}
      variant={variant}
      {...(props as React.ComponentProps<typeof RegistryToggleGroup>)}
    />
  );
}

function ToggleGroupItem({
  accessibilityLabel,
  id,
  role,
  testId,
  ...props
}: Omit<React.ComponentProps<typeof RegistryToggleGroupItem>, "nativeID" | "testID"> &
  ToggleGroupTestProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  });

  return <RegistryToggleGroupItem {...nativeTestProps} {...props} />;
}

export { ToggleGroup, ToggleGroupIcon, ToggleGroupItem };
