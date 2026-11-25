import type * as React from "react";
import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
import { buttonVariants, Button as RegistryButton } from "../../registry/web/button";

type ButtonProps = React.ComponentProps<typeof RegistryButton> & {
  accessibilityLabel?: string;
  id?: string;
  role?: string;
  testId?: string;
};

function Button({ accessibilityLabel, className, id, role, testId, ...props }: ButtonProps) {
  return (
    <RegistryButton
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
      className={cn(
        props.variant === "destructive" &&
          "bg-destructive-surface hover:bg-destructive-surface/90 dark:bg-destructive-surface",
        className,
      )}
    />
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
