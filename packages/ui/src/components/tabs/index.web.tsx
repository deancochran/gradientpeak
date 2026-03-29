"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";

import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
import {
  type TabsContentOptions,
  type TabsListOptions,
  type TabsListVariant,
  type TabsTestProps,
  type TabsTriggerOptions,
} from "./shared";

function tabsRootVariants(className?: string) {
  return cn("group/tabs flex gap-2 data-[orientation=horizontal]:flex-col", className);
}

function tabsListVariants({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: TabsListVariant;
} = {}) {
  return cn(
    "group/tabs-list inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
    variant === "default" && "bg-muted",
    variant === "line" && "gap-1 bg-transparent",
    className,
  );
}

function tabsTriggerVariants({ className }: { className?: string } = {}) {
  return cn(
    "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 shadow-none transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
    className,
  );
}

function tabsContentVariants(className?: string) {
  return cn("flex-1 outline-none", className);
}

function Tabs({
  accessibilityLabel,
  className,
  id,
  orientation = "horizontal",
  role,
  testId,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root> & TabsTestProps) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={tabsRootVariants(className)}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

function TabsList({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & TabsListOptions) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={tabsListVariants({ className, variant })}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

function TabsTrigger({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & TabsTriggerOptions) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={tabsTriggerVariants({ className })}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

function TabsContent({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content> & TabsContentOptions) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={tabsContentVariants(className)}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

export type { TabsListVariant } from "./shared";
export { Tabs, TabsContent, TabsList, TabsTrigger };
