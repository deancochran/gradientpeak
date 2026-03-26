import * as AvatarPrimitive from "@rn-primitives/avatar";

import { cn } from "../../lib/cn";
import { getNativeTestProps } from "../../lib/test-props";
import type { AvatarTestProps } from "./shared";

function avatarRootClasses(className?: string) {
  return cn("relative flex size-8 shrink-0 overflow-hidden rounded-full", className);
}

function avatarImageClasses(className?: string) {
  return cn("aspect-square size-full", className);
}

function avatarFallbackClasses(className?: string) {
  return cn("bg-muted flex size-full flex-row items-center justify-center rounded-full", className);
}

function Avatar({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  ...props
}: AvatarPrimitive.RootProps & React.RefAttributes<AvatarPrimitive.RootRef> & AvatarTestProps) {
  return (
    <AvatarPrimitive.Root
      className={avatarRootClasses(className)}
      {...(getNativeTestProps({
        accessibilityLabel,
        id,
        role,
        testId,
      }) as Pick<AvatarPrimitive.RootProps, "accessibilityLabel" | "nativeID" | "role" | "testID">)}
      {...props}
    />
  );
}

function AvatarImage({
  className,
  ...props
}: AvatarPrimitive.ImageProps & React.RefAttributes<AvatarPrimitive.ImageRef>) {
  return <AvatarPrimitive.Image className={avatarImageClasses(className)} {...props} />;
}

function AvatarFallback({
  className,
  ...props
}: AvatarPrimitive.FallbackProps & React.RefAttributes<AvatarPrimitive.FallbackRef>) {
  return <AvatarPrimitive.Fallback className={avatarFallbackClasses(className)} {...props} />;
}

export { Avatar, AvatarFallback, AvatarImage };
