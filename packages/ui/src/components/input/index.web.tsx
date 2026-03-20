import * as React from "react";

import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
import type { InputTestProps } from "./shared";

function inputVariants({ className }: { className?: string } = {}) {
  return cn(
    "border-input flex w-full min-w-0 rounded-md border px-3 py-1 text-base",
    "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 bg-transparent h-9 shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive dark:aria-invalid:ring-destructive/40",
    className,
  );
}

function Input({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  type,
  ...props
}: React.ComponentProps<"input"> & InputTestProps) {
  return (
    <input
      type={type}
      data-slot="input"
      className={inputVariants({ className })}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

export { Input, inputVariants };
