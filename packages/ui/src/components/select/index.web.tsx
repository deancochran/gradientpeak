"use client";

import * as React from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger as RegistrySelectTrigger,
  SelectValue,
} from "../../registry/web/select";
import { getWebTestProps } from "../../lib/test-props";
import type { Option, SelectTriggerSize } from "./shared";

function SelectTrigger({
  accessibilityLabel,
  id,
  size = "default",
  testId,
  ...props
}: React.ComponentProps<typeof RegistrySelectTrigger> & {
  accessibilityLabel?: string;
  id?: string;
  size?: SelectTriggerSize;
  testId?: string;
}) {
  return (
    <RegistrySelectTrigger
      size={size}
      {...getWebTestProps({ accessibilityLabel, id, testId })}
      {...props}
    />
  );
}

function NativeSelectScrollView({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export type { Option };
export {
  NativeSelectScrollView,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
