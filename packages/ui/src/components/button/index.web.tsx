import * as React from "react";
import { getWebTestProps } from "../../lib/test-props";
import { buttonVariants, Button as RegistryButton } from "../../registry/web/button";

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

export type { ButtonProps };
export { Button, buttonVariants };
