import { cn } from "../../lib/cn";
import { Input as RegistryInput } from "../../registry/native/input";
import { getNativeTestProps } from "../../lib/test-props";
import type { InputTestProps } from "./shared";

function inputVariants({ className, editable }: { className?: string; editable?: boolean } = {}) {
  return cn(
    "border-input flex w-full min-w-0 rounded-md border px-3 py-1 text-base",
    "bg-background text-foreground dark:bg-input/30 h-10 flex-row items-center leading-5 shadow-sm shadow-black/5 sm:h-9 placeholder:text-muted-foreground/50",
    editable === false && "opacity-50",
    className,
  );
}

type InputProps = Omit<React.ComponentProps<typeof RegistryInput>, "nativeID" | "testID"> &
  InputTestProps;

function Input({ accessibilityLabel, id, role, testId, ...props }: InputProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  });

  return <RegistryInput {...nativeTestProps} {...props} className={inputVariants(props)} />;
}

export { Input, inputVariants };
export type { InputProps };
