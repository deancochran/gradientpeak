import * as React from "react";

import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
import type { TextareaTestProps } from "./shared";

function Textarea({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<"textarea"> & TextareaTestProps) {
  return (
    <textarea
      className={cn(
        "text-foreground border-input min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm outline-none transition-[color,box-shadow]",
        "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      data-slot="textarea"
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

export { Textarea };
