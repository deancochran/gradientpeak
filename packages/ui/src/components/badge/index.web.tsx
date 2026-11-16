import type * as React from "react";
import { cn } from "../../lib/cn";
import type { TestProps } from "../../lib/test-props";
import { getWebTestProps } from "../../lib/test-props";
import { badgeVariants, Badge as RegistryBadge } from "../../registry/web/badge";

function Badge({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof RegistryBadge> & TestProps) {
  return (
    <RegistryBadge
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
      className={cn(
        props.variant === "destructive" &&
          "bg-destructive-surface dark:bg-destructive-surface [a&]:hover:bg-destructive-surface/90",
        className,
      )}
    />
  );
}

export { Badge, badgeVariants };
