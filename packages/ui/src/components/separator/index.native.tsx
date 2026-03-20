import * as SeparatorPrimitive from "@rn-primitives/separator";

import { cn } from "../../lib/cn";
import { getNativeTestProps } from "../../lib/test-props";
import type { SeparatorTestProps } from "./shared";

function separatorVariants({
  className,
  orientation = "horizontal",
}: {
  className?: string;
  orientation?: "horizontal" | "vertical";
}) {
  return cn(
    "bg-border shrink-0",
    orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
    className,
  );
}

function Separator({
  accessibilityLabel,
  className,
  decorative = true,
  id,
  orientation = "horizontal",
  role,
  testId,
  ...props
}: SeparatorPrimitive.RootProps &
  React.RefAttributes<SeparatorPrimitive.RootRef> &
  SeparatorTestProps) {
  return (
    <SeparatorPrimitive.Root
      decorative={decorative}
      orientation={orientation}
      className={separatorVariants({ className, orientation })}
      {...(getNativeTestProps({
        accessibilityLabel,
        id,
        role,
        testId,
      }) as Pick<
        SeparatorPrimitive.RootProps,
        "accessibilityLabel" | "nativeID" | "role" | "testID"
      >)}
      {...props}
    />
  );
}

export { Separator };
