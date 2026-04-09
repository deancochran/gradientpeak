import * as React from "react";
import type { TestProps } from "../../lib/test-props";
import { getWebTestProps } from "../../lib/test-props";
import { badgeVariants, Badge as RegistryBadge } from "../../registry/web/badge";

function Badge({
  accessibilityLabel,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof RegistryBadge> & TestProps) {
  return (
    <RegistryBadge {...getWebTestProps({ accessibilityLabel, id, role, testId })} {...props} />
  );
}

export { Badge, badgeVariants };
