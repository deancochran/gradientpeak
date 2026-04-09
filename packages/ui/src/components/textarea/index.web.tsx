import * as React from "react";
import { getWebTestProps } from "../../lib/test-props";
import { Textarea as RegistryTextarea } from "../../registry/web/textarea";
import type { TextareaTestProps } from "./shared";

function Textarea({
  accessibilityLabel,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof RegistryTextarea> & TextareaTestProps) {
  return (
    <RegistryTextarea {...getWebTestProps({ accessibilityLabel, id, role, testId })} {...props} />
  );
}

export { Textarea };
