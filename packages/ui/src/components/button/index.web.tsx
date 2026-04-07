import * as React from "react";

import { Button as RegistryButton, buttonVariants } from "../../registry/web/button";
import { getWebTestProps } from "../../lib/test-props";

type ButtonProps = React.ComponentProps<typeof RegistryButton> & {
  accessibilityLabel?: string;
  id?: string;
  role?: string;
  testId?: string;
};

function Button({ accessibilityLabel, id, role, testId, ...props }: ButtonProps) {
  return (
    <RegistryButton {...getWebTestProps({ accessibilityLabel, id, role, testId })} {...props} />
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
