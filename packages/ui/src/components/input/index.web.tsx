import * as React from "react";

import { Input as RegistryInput } from "../../registry/web/input";
import { getWebTestProps } from "../../lib/test-props";
import type { InputTestProps } from "./shared";

function inputVariants({ className }: { className?: string } = {}) {
  return className;
}

function Input({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof RegistryInput> & InputTestProps) {
  return (
    <RegistryInput
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      className={inputVariants({ className })}
      {...props}
    />
  );
}

export { Input, inputVariants };
