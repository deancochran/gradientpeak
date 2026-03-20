import * as LabelPrimitive from "@rn-primitives/label";

import { cn } from "../../lib/cn";
import { getNativeTestProps } from "../../lib/test-props";
import type { LabelTestProps } from "./shared";

function labelRootClasses({
  className,
  disabled,
}: {
  className?: string;
  disabled?: boolean;
} = {}) {
  return cn(
    "flex select-none items-center gap-2",
    "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
    disabled && "opacity-50",
    className,
  );
}

function labelTextClasses(className?: string) {
  return cn("text-foreground text-sm font-medium", className);
}

function Label({
  accessibilityLabel,
  className,
  disabled,
  id,
  onLongPress,
  onPress,
  onPressIn,
  onPressOut,
  role,
  testId,
  ...props
}: LabelPrimitive.TextProps &
  React.RefAttributes<LabelPrimitive.TextRef> &
  LabelTestProps) {
  return (
    <LabelPrimitive.Root
      className={labelRootClasses({ disabled })}
      disabled={disabled}
      {...(getNativeTestProps({
        accessibilityLabel,
        id,
        role,
        testId,
      }) as Pick<
        LabelPrimitive.RootProps,
        "accessibilityLabel" | "nativeID" | "role" | "testID"
      >)}
      onLongPress={onLongPress}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <LabelPrimitive.Text className={labelTextClasses(className)} {...props} />
    </LabelPrimitive.Root>
  );
}

export { Label };
