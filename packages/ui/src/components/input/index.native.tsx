import { forwardRef } from "react";
import { StyleSheet, type TextInput } from "react-native";
import { cn } from "../../lib/cn";
import { omitUndefined } from "../../lib/omit-undefined";
import { getNativeTestProps } from "../../lib/test-props";
import { Input as RegistryInput } from "../../registry/native/input";
import type { InputTestProps } from "./shared";

function inputVariants({ className, editable }: { className?: string; editable?: boolean } = {}) {
  return cn(
    "border-input w-full min-w-0 rounded-md border",
    "bg-background dark:bg-input/30 shadow-none",
    editable === false && "opacity-50",
    className,
  );
}

type InputProps = Omit<React.ComponentProps<typeof RegistryInput>, "nativeID" | "testID"> &
  InputTestProps & { inputRef?: React.Ref<TextInput> };
const RegistryInputWithRef: React.ComponentType<
  React.ComponentProps<typeof RegistryInput> & React.RefAttributes<TextInput>
> = RegistryInput;

const Input = forwardRef<TextInput, InputProps>(function Input(
  { accessibilityLabel, id, inputRef, role, testId, ...props },
  ref,
) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  });
  const setRef = (node: TextInput | null) => {
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
    <RegistryInputWithRef
      {...nativeTestProps}
      {...props}
      className={inputVariants(omitUndefined(props))}
      ref={setRef}
      style={{ minHeight: 48, textAlignVertical: "center", ...StyleSheet.flatten(props.style) }}
    />
  );
});

export type { InputProps };
export { Input, inputVariants };
