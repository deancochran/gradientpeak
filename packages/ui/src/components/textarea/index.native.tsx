import { getNativeTestProps } from "../../lib/test-props";
import { Textarea as RegistryTextarea } from "../../registry/native/textarea";
import type { TextareaTestProps } from "./shared";

function Textarea({
  accessibilityLabel,
  id,
  testId,
  ...props
}: Omit<React.ComponentProps<typeof RegistryTextarea>, "nativeID" | "testID"> & TextareaTestProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    testId,
  });

  return <RegistryTextarea {...nativeTestProps} {...props} />;
}

export { Textarea };
