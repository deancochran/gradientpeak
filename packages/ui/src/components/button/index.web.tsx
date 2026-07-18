import type * as React from "react";
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

type IconButtonProps = Omit<ButtonProps, "accessibilityLabel" | "children" | "size" | "testId"> & {
  accessibilityLabel: string;
  children: React.ReactNode;
  testId: string;
};

function IconButton({ accessibilityLabel, children, testId, ...props }: IconButtonProps) {
  return (
    <Button {...props} accessibilityLabel={accessibilityLabel} size="icon" testId={testId}>
      {children}
    </Button>
  );
}

export type { ButtonProps, IconButtonProps };
export { Button, buttonVariants, IconButton };
