import { LoaderCircle } from "lucide-react";
import type * as React from "react";
import { cn } from "../../lib/cn";
import { Button, type ButtonProps } from "../button/index.web";

export type SpinnerProps = React.ComponentProps<typeof LoaderCircle> & {
  label?: string;
};

export function Spinner({ className, label = "Loading", ...props }: SpinnerProps) {
  return (
    <LoaderCircle
      aria-label={label}
      className={cn("size-4 animate-spin", className)}
      role="status"
      {...props}
    />
  );
}

export type LoadingButtonProps = ButtonProps & {
  loading?: boolean;
  loadingLabel?: React.ReactNode;
  spinnerPlacement?: "start" | "end";
};

export function LoadingButton({
  children,
  disabled,
  loading = false,
  loadingLabel,
  spinnerPlacement = "start",
  ...props
}: LoadingButtonProps) {
  const label = loading && loadingLabel ? loadingLabel : children;

  return (
    <Button aria-busy={loading || undefined} disabled={disabled || loading} {...props}>
      {loading && spinnerPlacement === "start" ? <Spinner data-icon="inline-start" /> : null}
      {label}
      {loading && spinnerPlacement === "end" ? <Spinner data-icon="inline-end" /> : null}
    </Button>
  );
}

export type InlineLoadingStatusProps = React.HTMLAttributes<HTMLDivElement> & {
  loading?: boolean;
  label?: string;
  spinnerClassName?: string;
};

export function InlineLoadingStatus({
  className,
  label = "Loading...",
  loading = true,
  spinnerClassName,
  ...props
}: InlineLoadingStatusProps) {
  if (!loading) return null;

  return (
    <div
      aria-live="polite"
      className={cn("inline-flex items-center gap-2 text-xs text-muted-foreground", className)}
      role="status"
      {...props}
    >
      <Spinner className={spinnerClassName} />
      <span>{label}</span>
    </div>
  );
}
