import type * as React from "react";
import { cn } from "../../lib/cn";
import { Platform, TextInput, type TextInputProps } from "../../lib/react-native";
import { getNativeTestProps } from "../../lib/test-props";
import { TEXTAREA_DEFAULT_NUMBER_OF_LINES, type TextareaTestProps } from "./shared";

function Textarea({
  accessibilityLabel,
  className,
  id,
  multiline = true,
  numberOfLines = Platform.select(TEXTAREA_DEFAULT_NUMBER_OF_LINES),
  placeholderClassName,
  testId,
  ...props
}: TextInputProps & React.RefAttributes<TextInput> & TextareaTestProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    testId,
  });

  return (
    <TextInput
      className={cn(
        "text-foreground border-input dark:bg-input/30 flex min-h-16 w-full flex-row rounded-md border bg-transparent px-3 py-2 text-base shadow-sm shadow-black/5 md:text-sm",
        Platform.select({
          web: "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive field-sizing-content resize-y outline-none transition-[color,box-shadow] focus-visible:ring-[3px] disabled:cursor-not-allowed",
        }),
        props.editable === false && "opacity-50",
        className,
      )}
      multiline={multiline}
      numberOfLines={numberOfLines}
      placeholderClassName={cn("text-muted-foreground", placeholderClassName)}
      textAlignVertical="top"
      {...nativeTestProps}
      {...props}
    />
  );
}

export { Textarea };
