"use client";

import * as React from "react";
import { getWebTestProps } from "../../lib/test-props";
import {
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
  Avatar as RegistryAvatar,
} from "../../registry/web/avatar";
import type { AvatarTestProps } from "./shared";

function Avatar({
  accessibilityLabel,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof RegistryAvatar> & AvatarTestProps) {
  return (
    <RegistryAvatar {...getWebTestProps({ accessibilityLabel, id, role, testId })} {...props} />
  );
}

export { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage };
