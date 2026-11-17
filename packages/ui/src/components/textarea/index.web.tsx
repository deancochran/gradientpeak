import * as React from "react";
import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
import { Textarea as RegistryTextarea } from "../../registry/web/textarea";
import type { TextareaTestProps } from "./shared";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<typeof RegistryTextarea> &
    TextareaTestProps & { inputRef?: React.Ref<HTMLTextAreaElement> }
>(function Textarea({ accessibilityLabel, className, id, inputRef, role, testId, ...props }, ref) {
  const setRef = (node: HTMLTextAreaElement | null) => {
    if (typeof ref === "function") {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }

    if (typeof inputRef === "function") {
      inputRef(node);
    } else if (inputRef) {
      inputRef.current = node;
    }
  };

  return (
    <RegistryTextarea
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
      className={cn(
        "field-sizing-fixed min-h-24 resize-y shadow-none focus-visible:ring-2",
        className,
      )}
      ref={setRef}
    />
  );
});

export { Textarea };
