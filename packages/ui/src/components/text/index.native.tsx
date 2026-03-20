import { cva } from "class-variance-authority";
import * as Slot from "@rn-primitives/slot";
import * as React from "react";
import { Text as RNText } from "../../lib/react-native";

import { cn } from "../../lib/cn";
import { getNativeTestProps } from "../../lib/test-props";
import { TextClassContext } from "./context";
import {
  TEXT_ARIA_LEVEL,
  TEXT_ROLE,
  type TextTestProps,
  type TextVariant,
  type TextVariantProps,
} from "./shared";

const textVariants = cva("text-foreground text-base", {
  variants: {
    variant: {
      default: "",
      h1: "text-center text-4xl font-extrabold tracking-tight",
      h2: "border-border border-b pb-2 text-3xl font-semibold tracking-tight",
      h3: "text-2xl font-semibold tracking-tight",
      h4: "text-xl font-semibold tracking-tight",
      p: "mt-3 leading-7 sm:mt-6",
      blockquote: "mt-4 border-l-2 pl-3 italic sm:mt-6 sm:pl-6",
      code: "bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold",
      lead: "text-muted-foreground text-xl",
      large: "text-lg font-semibold",
      small: "text-sm font-medium leading-none",
      muted: "text-muted-foreground text-sm",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

type TextProps = React.ComponentProps<typeof RNText> &
  TextVariantProps & {
    asChild?: boolean;
  } & TextTestProps;

function Text({
  accessibilityLabel,
  asChild = false,
  className,
  id,
  testId,
  variant = "default",
  ...props
}: TextProps) {
  const contextClassName = React.useContext(TextClassContext);
  const Component = asChild ? Slot.Text : RNText;
  const resolvedVariant: TextVariant = variant ?? "default";
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    testId,
  });
  const textRole = TEXT_ROLE[resolvedVariant] as React.ComponentProps<
    typeof RNText
  >["role"];

  return (
    <Component
      aria-level={TEXT_ARIA_LEVEL[resolvedVariant]}
      className={cn(
        textVariants({ variant: resolvedVariant }),
        contextClassName,
        className,
      )}
      role={textRole as any}
      {...nativeTestProps}
      {...props}
    />
  );
}

export { Text, TextClassContext, textVariants };
export type { TextVariant, TextVariantProps } from "./shared";
export type { TextProps };
