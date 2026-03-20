"use client";

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import * as React from "react";

import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
import type { AlertDialogContentTestProps } from "./shared";

function buttonVariants({
  className,
  variant = "default",
}: {
  className?: string;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
} = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive dark:aria-invalid:ring-destructive/40 h-9 px-4 py-2 has-[>svg]:px-3",
    variant === "default" &&
      "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
    variant === "destructive" &&
      "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
    variant === "outline" &&
      "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
    variant === "secondary" &&
      "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
    variant === "ghost" &&
      "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
    variant === "link" && "text-primary underline-offset-4 hover:underline",
    className,
  );
}

function alertDialogOverlayVariants(className?: string) {
  return cn(
    "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
    className,
  );
}

function alertDialogContentVariants(className?: string) {
  return cn(
    "bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg",
    className,
  );
}

function alertDialogHeaderVariants(className?: string) {
  return cn("flex flex-col gap-2 text-center sm:text-left", className);
}

function alertDialogFooterVariants(className?: string) {
  return cn(
    "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
    className,
  );
}

function alertDialogTitleVariants(className?: string) {
  return cn("text-foreground text-lg font-semibold", className);
}

function alertDialogDescriptionVariants(className?: string) {
  return cn("text-muted-foreground text-sm", className);
}

function AlertDialog(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Root>,
) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>,
) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

function AlertDialogPortal(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Portal>,
) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  );
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={alertDialogOverlayVariants(className)}
      {...props}
    />
  );
}

function AlertDialogContent({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> &
  AlertDialogContentTestProps) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={alertDialogContentVariants(className)}
        {...getWebTestProps({ accessibilityLabel, id, role, testId })}
        {...props}
      />
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={alertDialogHeaderVariants(className)}
      {...props}
    />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={alertDialogFooterVariants(className)}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={alertDialogTitleVariants(className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={alertDialogDescriptionVariants(className)}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action>) {
  return (
    <AlertDialogPrimitive.Action
      className={cn(buttonVariants(), className)}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      className={cn(buttonVariants({ variant: "outline" }), className)}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
