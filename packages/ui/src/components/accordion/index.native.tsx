import * as AccordionPrimitive from "@rn-primitives/accordion";
import { ChevronDown } from "lucide-react-native";
import * as React from "react";
import { Platform, Pressable, View } from "react-native";
import Animated, {
  FadeOutUp,
  LayoutAnimationConfig,
  LinearTransition,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";

import { cn } from "../../lib/cn";
import { getNativeTestProps } from "../../lib/test-props";
import { Icon } from "../icon/index.native";
import { TextClassContext } from "../text/context";
import type { AccordionTestProps } from "./shared";

function accordionItemVariants(className?: string) {
  return cn("border-b last:border-b-0", className);
}

function accordionTriggerVariants(className?: string) {
  return cn(
    "flex-row items-start justify-between gap-4 rounded-md py-4 disabled:opacity-50",
    className,
  );
}

function accordionTriggerTextVariants() {
  return "text-left text-sm font-medium";
}

function accordionChevronVariants() {
  return "text-muted-foreground shrink-0";
}

function accordionContentVariants({
  className,
}: {
  className?: string;
  isExpanded?: boolean;
} = {}) {
  return cn("overflow-hidden text-sm", className);
}

function accordionContentInnerVariants(className?: string) {
  return cn("pb-4", className);
}

function Accordion({
  children,
  ...props
}: Omit<AccordionPrimitive.RootProps, "asChild"> &
  React.RefAttributes<AccordionPrimitive.RootRef>) {
  return (
    <LayoutAnimationConfig skipEntering>
      <AccordionPrimitive.Root
        {...(props as AccordionPrimitive.RootProps)}
        asChild={Platform.OS !== "web"}
      >
        <Animated.View layout={LinearTransition.duration(200)}>{children}</Animated.View>
      </AccordionPrimitive.Root>
    </LayoutAnimationConfig>
  );
}

function AccordionItem({
  children,
  className,
  accessibilityLabel,
  id,
  testId,
  value,
  ...props
}: AccordionPrimitive.ItemProps &
  React.RefAttributes<AccordionPrimitive.ItemRef> &
  AccordionTestProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    testId,
  });

  return (
    <AccordionPrimitive.Item
      className={accordionItemVariants(className)}
      value={value}
      asChild
      {...nativeTestProps}
      {...props}
    >
      <Animated.View
        className="native:overflow-hidden"
        layout={Platform.select({ native: LinearTransition.duration(200) })}
      >
        {children}
      </Animated.View>
    </AccordionPrimitive.Item>
  );
}

const Trigger = Platform.OS === "web" ? View : Pressable;

function AccordionTrigger({
  children,
  className,
  ...props
}: AccordionPrimitive.TriggerProps & {
  children?: React.ReactNode;
} & React.RefAttributes<AccordionPrimitive.TriggerRef>) {
  const { isExpanded } = AccordionPrimitive.useItemContext();

  const progress = useDerivedValue(
    () => (isExpanded ? withTiming(1, { duration: 250 }) : withTiming(0, { duration: 200 })),
    [isExpanded],
  );

  const chevronStyle = useAnimatedStyle(
    () => ({
      transform: [{ rotate: `${progress.value * 180}deg` }],
    }),
    [progress],
  );

  return (
    <TextClassContext.Provider value={accordionTriggerTextVariants()}>
      <AccordionPrimitive.Header>
        <AccordionPrimitive.Trigger {...props} asChild>
          <Trigger className={accordionTriggerVariants(className)}>
            <>{children}</>
            <Animated.View style={chevronStyle}>
              <Icon as={ChevronDown} size={16} className={accordionChevronVariants()} />
            </Animated.View>
          </Trigger>
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
    </TextClassContext.Provider>
  );
}

function AccordionContent({
  children,
  className,
  ...props
}: AccordionPrimitive.ContentProps & React.RefAttributes<AccordionPrimitive.ContentRef>) {
  const { isExpanded } = AccordionPrimitive.useItemContext();

  return (
    <TextClassContext.Provider value="text-sm">
      <AccordionPrimitive.Content className={accordionContentVariants({ isExpanded })} {...props}>
        <Animated.View
          exiting={Platform.select({ native: FadeOutUp.duration(200) })}
          className={accordionContentInnerVariants(className)}
        >
          {children}
        </Animated.View>
      </AccordionPrimitive.Content>
    </TextClassContext.Provider>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
