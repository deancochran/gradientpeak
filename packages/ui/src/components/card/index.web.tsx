import * as React from "react";

import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
import type { CardClassNameOptions } from "./shared";

function cardRootClasses(className?: string) {
  return cn(
    "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
    className,
  );
}

function cardHeaderClasses(className?: string) {
  return cn(
    "@container/card-header auto-rows-min grid grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
    className,
  );
}

function cardTitleClasses(className?: string) {
  return cn("font-semibold leading-none", className);
}

function cardDescriptionClasses(className?: string) {
  return cn("text-muted-foreground text-sm", className);
}

function cardActionClasses(className?: string) {
  return cn(
    "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
    className,
  );
}

function cardContentClasses(className?: string) {
  return cn("px-6", className);
}

function cardFooterClasses(className?: string) {
  return cn("flex items-center px-6 [.border-t]:pt-6", className);
}

function Card({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<"div"> & CardClassNameOptions) {
  return (
    <div
      data-slot="card"
      className={cardRootClasses(className)}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

function CardHeader({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<"div"> & CardClassNameOptions) {
  return (
    <div
      data-slot="card-header"
      className={cardHeaderClasses(className)}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

function CardTitle({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<"div"> & CardClassNameOptions) {
  return (
    <div
      data-slot="card-title"
      className={cardTitleClasses(className)}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

function CardDescription({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<"div"> & CardClassNameOptions) {
  return (
    <div
      data-slot="card-description"
      className={cardDescriptionClasses(className)}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

function CardAction({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<"div"> & CardClassNameOptions) {
  return (
    <div
      data-slot="card-action"
      className={cardActionClasses(className)}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

function CardContent({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<"div"> & CardClassNameOptions) {
  return (
    <div
      data-slot="card-content"
      className={cardContentClasses(className)}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

function CardFooter({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<"div"> & CardClassNameOptions) {
  return (
    <div
      data-slot="card-footer"
      className={cardFooterClasses(className)}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};
