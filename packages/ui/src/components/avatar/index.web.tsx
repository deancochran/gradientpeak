"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
import type { AvatarTestProps } from "./shared";

function avatarRootClasses(className?: string) {
  return cn(
    "relative flex size-8 shrink-0 overflow-hidden rounded-full",
    className,
  );
}

function avatarImageClasses(className?: string) {
  return cn("aspect-square size-full", className);
}

function avatarFallbackClasses(className?: string) {
  return cn(
    "bg-muted flex size-full items-center justify-center rounded-full",
    className,
  );
}

function Avatar({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & AvatarTestProps) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={avatarRootClasses(className)}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={avatarImageClasses(className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={avatarFallbackClasses(className)}
      {...props}
    />
  );
}

export { Avatar, AvatarFallback, AvatarImage };
