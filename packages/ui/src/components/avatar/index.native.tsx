import * as React from "react";

import {
  Avatar as RegistryAvatar,
  AvatarFallback,
  AvatarImage,
} from "../../registry/native/avatar";
import { getNativeTestProps } from "../../lib/test-props";
import type { AvatarTestProps } from "./shared";

function Avatar({
  accessibilityLabel,
  id,
  role,
  testId,
  ...props
}: Omit<React.ComponentProps<typeof RegistryAvatar>, "nativeID" | "testID"> & AvatarTestProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  });

  return <RegistryAvatar {...nativeTestProps} {...props} />;
}

export { Avatar, AvatarFallback, AvatarImage };
