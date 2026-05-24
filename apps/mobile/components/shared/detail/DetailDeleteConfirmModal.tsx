import { AppConfirmModal } from "@/components/shared/AppFormModal";

type DetailDeleteConfirmModalProps = {
  description?: string;
  entityLabel: string;
  entityName?: string | null;
  onClose: () => void;
  onConfirm: () => void;
  pending?: boolean;
  testIDPrefix: string;
};

export function DetailDeleteConfirmModal({
  description,
  entityLabel,
  entityName,
  onClose,
  onConfirm,
  pending = false,
  testIDPrefix,
}: DetailDeleteConfirmModalProps) {
  const resolvedDescription =
    description ??
    `Are you sure you want to delete${entityName ? ` "${entityName}"` : ` this ${entityLabel.toLowerCase()}`}? This cannot be undone.`;

  return (
    <AppConfirmModal
      description={resolvedDescription}
      onClose={onClose}
      primaryAction={{
        disabled: pending,
        label: pending ? "Deleting..." : `Delete ${entityLabel}`,
        onPress: onConfirm,
        testID: `${testIDPrefix}-delete-confirm`,
        variant: "destructive",
      }}
      secondaryAction={{
        label: "Cancel",
        onPress: onClose,
        variant: "outline",
      }}
      testID={`${testIDPrefix}-delete-modal`}
      title={`Delete ${entityLabel}`}
    />
  );
}
