"use client";

import * as React from "react";

import {
  Avatar as RegistryAvatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "../../registry/web/avatar";
import { getWebTestProps } from "../../lib/test-props";
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
