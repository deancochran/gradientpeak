import type { ReactNode } from "react";

export type DisclosureProps = {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  label: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  testId?: string;
};
