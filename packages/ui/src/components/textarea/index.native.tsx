import { forwardRef } from "react";
import type { TextInput } from "react-native";
import { cn } from "../../lib/cn";
import { getNativeTestProps } from "../../lib/test-props";
import { Textarea as RegistryTextarea } from "../../registry/native/textarea";
import type { TextareaTestProps } from "./shared";

type TextareaProps = Omit<React.ComponentProps<typeof RegistryTextarea>, "nativeID" | "testID"> &
  TextareaTestProps & { inputRef?: React.Ref<TextInput> };
const RegistryTextareaWithRef: React.ComponentType<
  React.ComponentProps<typeof RegistryTextarea> & React.RefAttributes<TextInput>
> = RegistryTextarea;

const Textarea = forwardRef<TextInput, TextareaProps>(function Textarea(
  { accessibilityLabel, className, id, inputRef, testId, ...props },
  ref,
) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
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
    <RegistryTextareaWithRef
      {...nativeTestProps}
      {...props}
      className={cn("shadow-none", className)}
      ref={setRef}
    />
  );
});

export { Textarea };
