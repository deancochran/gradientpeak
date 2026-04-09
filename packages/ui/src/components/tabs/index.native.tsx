import * as React from "react";
import { cn } from "../../lib/cn";
import { getNativeTestProps } from "../../lib/test-props";
import {
  Tabs as RegistryTabs,
  TabsContent as RegistryTabsContent,
  TabsList as RegistryTabsList,
  TabsTrigger as RegistryTabsTrigger,
} from "../../registry/native/tabs";
import type {
  TabsContentOptions,
  TabsListOptions,
  TabsTestProps,
  TabsTriggerOptions,
} from "./shared";

function Tabs({
  accessibilityLabel,
  id,
  role,
  testId,
  ...props
}: Omit<React.ComponentProps<typeof RegistryTabs>, "nativeID" | "testID"> & TabsTestProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  });

  return <RegistryTabs {...nativeTestProps} {...props} />;
}

function TabsList({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  variant = "default",
  ...props
}: Omit<React.ComponentProps<typeof RegistryTabsList>, "nativeID" | "testID"> & TabsListOptions) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  });

  return (
    <RegistryTabsList
      className={cn(variant === "line" && "gap-1 bg-transparent", className)}
      {...nativeTestProps}
      {...props}
    />
  );
}

function TabsTrigger({
  accessibilityLabel,
  id,
  role,
  testId,
  ...props
}: Omit<React.ComponentProps<typeof RegistryTabsTrigger>, "nativeID" | "testID"> &
  TabsTriggerOptions) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  });

  return <RegistryTabsTrigger {...nativeTestProps} {...props} />;
}

function TabsContent({
  accessibilityLabel,
  id,
  role,
  testId,
  ...props
}: Omit<React.ComponentProps<typeof RegistryTabsContent>, "nativeID" | "testID"> &
  TabsContentOptions) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  });

  return <RegistryTabsContent {...nativeTestProps} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
