"use client";

import * as React from "react";

import {
  ToggleGroup as RegistryToggleGroup,
  ToggleGroupItem as RegistryToggleGroupItem,
} from "../../registry/web/toggle-group";
import { getWebTestProps } from "../../lib/test-props";
import type { ToggleGroupTestProps } from "./shared";

function ToggleGroup({
  accessibilityLabel,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof RegistryToggleGroup> & ToggleGroupTestProps) {
  return (
    <RegistryToggleGroup
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

function ToggleGroupItem({
  accessibilityLabel,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof RegistryToggleGroupItem> & ToggleGroupTestProps) {
  return (
    <RegistryToggleGroupItem
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
