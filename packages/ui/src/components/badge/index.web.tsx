import * as React from "react";

import { Badge as RegistryBadge, badgeVariants } from "../../registry/web/badge";
import { getWebTestProps } from "../../lib/test-props";
import type { TestProps } from "../../lib/test-props";

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
