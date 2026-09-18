import * as React from "react";
import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
import { Input as RegistryInput } from "../../registry/web/input";
import type { InputTestProps } from "./shared";

function inputVariants({ className }: { className?: string } = {}) {
  return cn("shadow-none focus-visible:ring-2", className);
}

const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<typeof RegistryInput> &
    InputTestProps & { inputRef?: React.Ref<HTMLInputElement> }
>(function Input({ accessibilityLabel, className, id, inputRef, role, testId, ...props }, ref) {
  const setRef = (node: HTMLInputElement | null) => {
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
    <RegistryInput
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      className={inputVariants({ className })}
      ref={setRef}
      {...props}
    />
  );
});

export { Input, inputVariants };
