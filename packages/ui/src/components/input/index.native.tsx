import * as React from "react";
import { TextInput, type TextInputProps } from "../../lib/react-native";

import { cn } from "../../lib/cn";
import { getNativeTestProps } from "../../lib/test-props";
import type { InputTestProps } from "./shared";

function inputVariants({
  className,
  editable,
}: {
  className?: string;
  editable?: boolean;
} = {}) {
  return cn(
    "border-input flex w-full min-w-0 rounded-md border px-3 py-1 text-base",
    "bg-background text-foreground dark:bg-input/30 h-10 flex-row items-center leading-5 shadow-sm shadow-black/5 sm:h-9 placeholder:text-muted-foreground/50",
    editable === false && "opacity-50",
    className,
  );
}

type InputProps = TextInputProps &
  React.RefAttributes<TextInput> &
  InputTestProps;

function Input({
  accessibilityLabel,
  className,
  editable,
  id,
  role,
  testId,
  ...props
}: InputProps) {
  const nativeTestProps = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  }) as Pick<
    TextInputProps,
    "accessibilityLabel" | "nativeID" | "role" | "testID"
  >;

  return (
    <TextInput
      className={inputVariants({ className, editable })}
      editable={editable}
      {...nativeTestProps}
      {...props}
    />
  );
}

export { Input, inputVariants };
