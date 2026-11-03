import type { ActivityPlanSummary } from "@repo/core";
import { AppBottomSheetContent } from "@/components/shared/AppBottomSheet";
import { TrainingPlanBuilderEventEditor } from "@/components/training-plan/create/TrainingPlanBuilderEventCard";
import { omitUndefined } from "@/lib/omitUndefined";
import type { TrainingPlanBuilderSession } from "@/lib/training-plan-creation/types";

type BuilderSessionEditorContentProps = {
  session: TrainingPlanBuilderSession;
  activityPlan?: ActivityPlanSummary | null;
  onChange: (session: TrainingPlanBuilderSession) => void;
  onDuplicate: (sessionId: string) => void;
  onOpenActivityPicker: (sessionId: string) => void;
  onRemove: (sessionId: string) => void;
  onNumericDraftError: (key: string, message: string | null) => void;
  rawDrafts?: Record<string, string>;
  onRawDraftChange?: (key: string, value: string) => void;
};

export function BuilderSessionEditorContent(props: BuilderSessionEditorContentProps) {
  return (
    <AppBottomSheetContent enableFooterMarginAdjustment paddingBottom={48}>
      <TrainingPlanBuilderEventEditor
        {...omitUndefined({ activityPlan: props.activityPlan })}
        event={props.session}
        onChange={props.onChange}
        onDuplicate={props.onDuplicate}
        onOpenActivityPicker={props.onOpenActivityPicker}
        onNumericDraftError={props.onNumericDraftError}
        onRemove={props.onRemove}
        rawDrafts={props.rawDrafts}
        onRawDraftChange={props.onRawDraftChange}
      />
    </AppBottomSheetContent>
  );
}
