"use client";

import * as React from "react";
import { getWebTestProps } from "../../lib/test-props";
import {
  Tabs as RegistryTabs,
  TabsContent as RegistryTabsContent,
  TabsList as RegistryTabsList,
  TabsTrigger as RegistryTabsTrigger,
  tabsListVariants,
} from "../../registry/web/tabs";
import type {
  TabsContentOptions,
  TabsListOptions,
  TabsListVariant,
  TabsTestProps,
  TabsTriggerOptions,
} from "./shared";

function Tabs({
  accessibilityLabel,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof RegistryTabs> & TabsTestProps) {
  return <RegistryTabs {...getWebTestProps({ accessibilityLabel, id, role, testId })} {...props} />;
}

function TabsList({
  accessibilityLabel,
  id,
  role,
  testId,
  variant = "default",
  ...props
}: React.ComponentProps<typeof RegistryTabsList> & TabsListOptions) {
  return (
    <RegistryTabsList
      variant={variant}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
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
}: React.ComponentProps<typeof RegistryTabsTrigger> & TabsTriggerOptions) {
  return (
    <RegistryTabsTrigger
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

function TabsContent({
  accessibilityLabel,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof RegistryTabsContent> & TabsContentOptions) {
  return (
    <RegistryTabsContent
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

export type { TabsListVariant };
export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants };
