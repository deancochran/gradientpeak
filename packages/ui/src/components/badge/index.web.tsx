import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
import { type BadgeTestProps, type BadgeVariant } from "./shared";

const badgeVariantClasses = {
  default:
    "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
  secondary:
    "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
  destructive:
    "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
  outline:
    "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
} satisfies Record<BadgeVariant, string>;

function badgeVariants({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: BadgeVariant;
} = {}) {
  return cn(
    "border-border inline-flex shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-2 py-0.5 text-xs font-medium",
    "w-fit whitespace-nowrap transition-[color,box-shadow] [&>svg]:pointer-events-none [&>svg]:size-3 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive dark:aria-invalid:ring-destructive/40",
    badgeVariantClasses[variant],
    className,
  );
}

type BadgeProps = React.ComponentProps<"span"> &
  BadgeTestProps & {
    asChild?: boolean;
    variant?: BadgeVariant;
  };

function Badge({
  accessibilityLabel,
  asChild = false,
  className,
  id,
  role,
  testId,
  variant,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={badgeVariants({ className, variant })}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
