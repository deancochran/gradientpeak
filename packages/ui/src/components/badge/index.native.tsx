import * as React from "react";
import { getNativeTestProps } from "../../lib/test-props";
import type { BadgeProps as RegistryBadgeProps } from "../../registry/native/badge";
import {
  badgeTextVariants,
  badgeVariants,
  Badge as RegistryBadge,
} from "../../registry/native/badge";
import type { BadgeTestProps } from "./shared";

type BadgeProps = Omit<RegistryBadgeProps, "nativeID" | "testID"> & BadgeTestProps;

function Badge({ accessibilityLabel, id, role, testId, ...props }: BadgeProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  });

  return <RegistryBadge {...nativeTestProps} {...props} />;
}

export type { BadgeProps };
export { Badge, badgeTextVariants, badgeVariants };
