import type { TestProps } from "../../lib/test-props";

export type AlertDialogPlatform = "native" | "web";

export type AlertDialogContentTestProps = Omit<TestProps, "role">;

export type AlertDialogClassNameOptions = {
  className?: string;
};
