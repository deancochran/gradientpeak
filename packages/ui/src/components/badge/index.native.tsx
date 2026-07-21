import { cn } from "../../lib/cn";
import { getNativeTestProps } from "../../lib/test-props";
import type { BadgeProps as RegistryBadgeProps } from "../../registry/native/badge";
import {
  badgeTextVariants,
  badgeVariants,
  Badge as RegistryBadge,
} from "../../registry/native/badge";
import type { BadgeTestProps } from "./shared";

type BadgeProps = Omit<RegistryBadgeProps, "nativeID" | "testID"> & BadgeTestProps;

function Badge({ accessibilityLabel, className, id, role, testId, ...props }: BadgeProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  });

  return (
    <RegistryBadge
      {...nativeTestProps}
      {...props}
      className={cn(props.variant === "destructive" && "bg-destructive-surface", className)}
    />
  );
}

export type { BadgeProps };
export { Badge, badgeTextVariants, badgeVariants };
