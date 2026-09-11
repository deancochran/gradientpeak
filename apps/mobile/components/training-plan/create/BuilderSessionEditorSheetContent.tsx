import type { ActivityPlanSummary } from "@repo/core";
import { View } from "react-native";
import { ActivityPlanVariantSelector } from "@/components/activity-plan/ActivityPlanVariantSelector";
import { AppBottomSheetContent } from "@/components/shared/AppBottomSheet";
import { TrainingPlanBuilderEventEditor } from "@/components/training-plan/create/TrainingPlanBuilderEventCard";
import { api } from "@/lib/api";
import type { TrainingPlanBuilderSession } from "@/lib/training-plan-creation/types";

type BuilderSessionEditorContentProps = {
  session: TrainingPlanBuilderSession;
  activityPlan?: ActivityPlanSummary | null;
  onChange: (session: TrainingPlanBuilderSession) => void;
  onDuplicate: (sessionId: string) => void;
  onOpenActivityPicker: (sessionId: string) => void;
  onRemove: (sessionId: string) => void;
};

export function BuilderSessionEditorContent(props: BuilderSessionEditorContentProps) {
  const activityPlanId = props.session.activityPlan?.id ?? "";
  const detailQuery = api.activityPlans.getById.useQuery(
    { id: activityPlanId },
    { enabled: activityPlanId.length > 0 },
  );
  const detail = detailQuery.data?.detail;
  const selectedVariantId = props.session.activityPlanVariantId ?? detail?.defaultVariantId;

  const selectVariant = (variantId: string | undefined) => {
    if (variantId === undefined) {
      const { activityPlanVariantId: _removed, ...session } = props.session;
      props.onChange(session);
      return;
    }
    props.onChange({ ...props.session, activityPlanVariantId: variantId });
  };

  return (
    <AppBottomSheetContent enableFooterMarginAdjustment paddingBottom={48}>
      <View className="gap-4">
        {detail && selectedVariantId ? (
          <ActivityPlanVariantSelector
            allowCurrentDefault
            defaultVariantId={detail.defaultVariantId}
            label="Activity-plan variant"
            onSelect={selectVariant}
            selectedVariantId={selectedVariantId}
            selection={props.session.activityPlanVariantId ? "explicit" : "default"}
            testIDPrefix="training-plan-session-variant"
            variants={detail.variants}
          />
        ) : null}
        <TrainingPlanBuilderEventEditor
          activityPlan={props.activityPlan}
          event={props.session}
          onChange={props.onChange}
          onDuplicate={props.onDuplicate}
          onOpenActivityPicker={props.onOpenActivityPicker}
          onRemove={props.onRemove}
        />
      </View>
    </AppBottomSheetContent>
  );
}
