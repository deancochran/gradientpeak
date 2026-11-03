import type { ActivityPlanDraftStep, ActivityTargetCategory } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { useRef, useState } from "react";
import { Alert } from "react-native";
import { AppFormModal } from "@/components/shared/AppFormModal";
import { createIncompleteActivityPlanStep } from "@/lib/activityPlanDefaults";
import { StepEditorFields, type StepEditorFieldsHandle } from "./StepEditorFields";

export { fromStepEditorTargets, toStepEditorTargets } from "./StepEditorFields";

interface StepEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step?: ActivityPlanDraftStep;
  onSave: (step: ActivityPlanDraftStep) => void | Promise<void>;
  activityCategory: ActivityTargetCategory;
  defaultSegmentName?: string;
  /** The composer removes an untouched provisional step when its editor is cancelled. */
  onDiscard?: () => void;
  /** A supplied step can still be a provisional draft owned by the composer. */
  isNew?: boolean;
}

function StepDialogSession(props: StepEditorDialogProps) {
  const [step] = useState(() => props.step ?? createIncompleteActivityPlanStep());
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fields = useRef<StepEditorFieldsHandle>(null);
  const saving = useRef(false);
  const isNew = props.isNew ?? !props.step;
  const close = () => props.onOpenChange(false);
  const discard = () => {
    if (isNew) props.onDiscard?.();
    close();
  };
  const requestClose = () => {
    if (saving.current) return;
    if (!dirty) {
      discard();
      return;
    }
    Alert.alert("Discard edits?", "Your changes to this step will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard edits", style: "destructive", onPress: discard },
    ]);
  };
  const save = async () => {
    if (saving.current) return;
    const handle = fields.current;
    if (!handle) {
      setSaveError("The editor is still loading. Please try Done again.");
      return;
    }
    const saved = handle.validate();
    if (!saved) {
      return;
    }
    saving.current = true;
    setIsSaving(true);
    setSaveError(null);
    try {
      await props.onSave(saved);
      close();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not save this step. Please try again.",
      );
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };
  return (
    <AppFormModal
      presentationStyle="fullScreen"
      actionPlacement="header"
      dismissDisabled={isSaving}
      onClose={requestClose}
      primaryAction={
        <Button
          disabled={isSaving}
          testID="step-editor-save-button"
          onPress={() => void save()}
          variant="ghost"
        >
          <Text className="font-semibold">{isNew ? "Add" : "Save"}</Text>
        </Button>
      }
      testID="step-editor-modal"
      title={isNew ? "Add Step" : "Edit Step"}
    >
      <StepEditorFields
        ref={fields}
        step={step}
        activityCategory={props.activityCategory}
        onDirtyChange={setDirty}
      />
      {saveError ? (
        <Text accessibilityRole="alert" className="text-destructive">
          {saveError}
        </Text>
      ) : null}
    </AppFormModal>
  );
}

export function StepEditorDialog(props: StepEditorDialogProps) {
  return props.open ? <StepDialogSession key={props.step?.id ?? "new"} {...props} /> : null;
}
