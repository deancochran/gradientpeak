import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent as RegistryAlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../registry/native/alert-dialog";
import { getNativeTestProps } from "../../lib/test-props";
import type { AlertDialogContentTestProps } from "./shared";

function AlertDialogContent({
  accessibilityLabel,
  id,
  testId,
  ...props
}: Omit<React.ComponentProps<typeof RegistryAlertDialogContent>, "nativeID" | "testID"> &
  AlertDialogContentTestProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    testId,
  });

  return <RegistryAlertDialogContent {...nativeTestProps} {...props} />;
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
