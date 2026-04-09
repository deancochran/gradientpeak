"use client";

import * as React from "react";
import { getWebTestProps } from "../../lib/test-props";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogContent as RegistryAlertDialogContent,
} from "../../registry/web/alert-dialog";
import type { AlertDialogContentTestProps } from "./shared";

function AlertDialogContent({
  accessibilityLabel,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof RegistryAlertDialogContent> & AlertDialogContentTestProps) {
  return (
    <RegistryAlertDialogContent
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
