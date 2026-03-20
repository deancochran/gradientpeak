import * as TabsPrimitive from "@rn-primitives/tabs";
import { cn } from "../../lib/cn";
import { getNativeTestProps } from "../../lib/test-props";
import { TextClassContext } from "../text/context";
import {
  type TabsContentOptions,
  type TabsListOptions,
  type TabsTestProps,
  type TabsTriggerOptions,
} from "./shared";

function tabsRootVariants(className?: string) {
  return cn("flex flex-col gap-2", className);
}

function tabsListVariants({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "line";
} = {}) {
  return cn(
    "group/tabs-list mr-auto flex h-9 flex-row items-center justify-center rounded-lg p-[3px] text-muted-foreground",
    variant === "default" && "bg-muted",
    variant === "line" && "gap-1 bg-transparent",
    className,
  );
}

function tabsTriggerVariants({
  active = false,
  className,
  disabled = false,
}: {
  active?: boolean;
  className?: string;
  disabled?: boolean;
} = {}) {
  return cn(
    "h-[calc(100%-1px)] flex flex-row items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 shadow-none shadow-black/5",
    disabled && "opacity-50",
    active && "bg-background dark:border-foreground/10 dark:bg-input/30",
    className,
  );
}

function tabsTriggerTextVariants(active = false) {
  return cn(
    "text-foreground text-sm font-medium dark:text-muted-foreground",
    active && "dark:text-foreground",
  );
}

function tabsContentVariants(className?: string) {
  return cn(className);
}

function Tabs({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  ...props
}: TabsPrimitive.RootProps &
  React.RefAttributes<TabsPrimitive.RootRef> &
  TabsTestProps) {
  const nativeTestProps = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  }) as Pick<
    TabsPrimitive.RootProps,
    "accessibilityLabel" | "nativeID" | "role" | "testID"
  >;

  return (
    <TabsPrimitive.Root
      className={tabsRootVariants(className)}
      {...nativeTestProps}
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
}: TabsPrimitive.ListProps &
  React.RefAttributes<TabsPrimitive.ListRef> &
  TabsListOptions) {
  const nativeTestProps = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  }) as Pick<
    TabsPrimitive.ListProps,
    "accessibilityLabel" | "nativeID" | "role" | "testID"
  >;

  return (
    <TabsPrimitive.List
      className={tabsListVariants({ className, variant })}
      {...nativeTestProps}
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
}: TabsPrimitive.TriggerProps &
  React.RefAttributes<TabsPrimitive.TriggerRef> &
  TabsTriggerOptions) {
  const { value } = TabsPrimitive.useRootContext();
  const active = value === props.value;
  const nativeTestProps = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  }) as Pick<
    TabsPrimitive.TriggerProps,
    "accessibilityLabel" | "nativeID" | "role" | "testID"
  >;

  return (
    <TextClassContext.Provider value={tabsTriggerTextVariants(active)}>
      <TabsPrimitive.Trigger
        className={tabsTriggerVariants({
          active,
          className,
          disabled: !!props.disabled,
        })}
        {...nativeTestProps}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

function TabsContent({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  ...props
}: TabsPrimitive.ContentProps &
  React.RefAttributes<TabsPrimitive.ContentRef> &
  TabsContentOptions) {
  const nativeTestProps = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  }) as Pick<
    TabsPrimitive.ContentProps,
    "accessibilityLabel" | "nativeID" | "role" | "testID"
  >;

  return (
    <TabsPrimitive.Content
      className={tabsContentVariants(className)}
      {...nativeTestProps}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
