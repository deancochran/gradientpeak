import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { ActivityPlan } from "@/components/shared/ActivityPlanCard";
import { TrainingPlanBuilderEventEditor } from "@/components/training-plan/create/TrainingPlanBuilderEventCard";
import type { TrainingPlanBuilderSession } from "@/lib/training-plan-creation/types";

type BuilderSessionEditorContentProps = {
  session: TrainingPlanBuilderSession;
  activityPlan?: ActivityPlan | null;
  onChange: (session: TrainingPlanBuilderSession) => void;
  onDuplicate: (sessionId: string) => void;
  onOpenActivityPicker: (sessionId: string) => void;
};

export function BuilderSessionEditorContent(props: BuilderSessionEditorContentProps) {
  return (
    <BottomSheetScrollView
      enableFooterMarginAdjustment
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 48,
      }}
      showsVerticalScrollIndicator
    >
      <TrainingPlanBuilderEventEditor
        activityPlan={props.activityPlan}
        event={props.session}
        onChange={props.onChange}
        onDuplicate={props.onDuplicate}
        onOpenActivityPicker={props.onOpenActivityPicker}
      />
    </BottomSheetScrollView>
  );
}
