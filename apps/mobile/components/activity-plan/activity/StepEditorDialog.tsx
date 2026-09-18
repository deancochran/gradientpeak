import type {
  ActivityPlanIntervalStep,
  ActivityPlanTargetAnchors,
  ActivityTargetCategory,
} from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { useRef, useState } from "react";
import { AppFormModal } from "@/components/shared/AppFormModal";
import { createDefaultActivityPlanStep } from "@/lib/activityPlanDefaults";
import { useDirtyCloseGuard } from "@/lib/hooks/useDirtyCloseGuard";
import { StepEditorFields, type StepEditorFieldsHandle } from "./StepEditorFields";

export { fromStepEditorTargets, toStepEditorTargets } from "./StepEditorFields";

interface StepEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step?: ActivityPlanIntervalStep;
  onSave: (step: ActivityPlanIntervalStep) => void;
  activityCategory: ActivityTargetCategory;
  targetAnchors?: ActivityPlanTargetAnchors;
  defaultSegmentName?: string;
}

function StepDialogSession(props: StepEditorDialogProps) {
  const [step] = useState(
    () =>
      props.step ??
      createDefaultActivityPlanStep({
        activityCategory: props.activityCategory,
        ...(props.targetAnchors === undefined ? {} : { anchors: props.targetAnchors }),
      }),
  );
  const fields = useRef<StepEditorFieldsHandle>(null);
  const [dirty, setDirty] = useState(false);
  const requestClose = useDirtyCloseGuard({ isDirty: dirty });
  return (
    <AppFormModal
      actionPlacement="header"
      onClose={() => requestClose(() => props.onOpenChange(false))}
      primaryAction={
        <Button
          className="min-h-12"
          testID="step-editor-save-button"
          onPress={() => {
            const saved = fields.current?.validate();
            if (!saved) return;
            props.onSave(saved);
            props.onOpenChange(false);
          }}
        >
          <Text>{props.step ? "Done" : "Add Step"}</Text>
        </Button>
      }
      testID="step-editor-modal"
      title={props.step ? "Edit Step" : "Add Step"}
    >
      <StepEditorFields
        ref={fields}
        step={step}
        activityCategory={props.activityCategory}
        {...(props.targetAnchors === undefined ? {} : { targetAnchors: props.targetAnchors })}
        onDirtyChange={setDirty}
      />
    </AppFormModal>
  );
}

export function StepEditorDialog(props: StepEditorDialogProps) {
  return props.open ? <StepDialogSession key={props.step?.id ?? "new"} {...props} /> : null;
}
