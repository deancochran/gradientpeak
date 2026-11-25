import { Button } from "@repo/ui/components/button";
import { DateInput as DateField } from "@repo/ui/components/date-input";
import { Text } from "@repo/ui/components/text";
import { TouchableOpacity, View } from "react-native";
import { AppFormModal } from "@/components/shared/AppFormModal";

type ScheduleAnchorMode = "start" | "finish";
type ScheduleApplicationMode = "full" | "remaining";

interface TrainingPlanTemplateSchedulingDialogProps {
  applyPending: boolean;
  inputsLocked?: boolean;
  previewPending?: boolean;
  scheduleError?: string | null;
  applicationsLoading?: boolean;
  applicationsError?: string | null;
  onRetryApplications?: () => void;
  onApply: () => void;
  onScheduleModalOpenChange: (open: boolean) => void;
  onSelectScheduleApplicationMode: (mode: ScheduleApplicationMode) => void;
  onSelectScheduleAnchorMode: (mode: ScheduleAnchorMode) => void;
  scheduleApplicationMode: ScheduleApplicationMode;
  scheduleAnchorContent: {
    fieldLabel: string;
    fieldPlaceholder: string;
    helperText: string;
  };
  scheduleAnchorMode: ScheduleAnchorMode;
  scheduleReview: {
    preview: {
      applicable: boolean;
      replacement: { affected: Array<unknown> } | null;
      sessions: Array<{ planningDate: string }>;
      unresolved: Array<unknown>;
    };
  } | null;
  scheduledApplications: Array<{
    application_id: string;
    eligible_future_count: number;
    source_revision: number;
    start_date: string;
  }>;
  selectedApplicationId: string;
  onSelectApplication: (applicationId: string) => void;
  setTemplateAnchorDate: (value: string) => void;
  showScheduleModal: boolean;
  templateAnchorDate: string;
}

function SelectionIndicator({ active }: { active: boolean }) {
  return (
    <View
      className={`mt-0.5 size-4 items-center justify-center rounded-full border ${
        active ? "border-primary" : "border-input dark:bg-input/30"
      }`}
    >
      {active ? <View className="bg-primary size-2 rounded-full" /> : null}
    </View>
  );
}

export function TrainingPlanTemplateSchedulingDialog({
  applyPending,
  inputsLocked = applyPending,
  previewPending = false,
  scheduleError,
  applicationsLoading = false,
  applicationsError,
  onRetryApplications,
  onApply,
  onScheduleModalOpenChange,
  onSelectScheduleApplicationMode,
  onSelectScheduleAnchorMode,
  scheduleApplicationMode,
  scheduleAnchorContent,
  scheduleAnchorMode,
  scheduleReview,
  scheduledApplications,
  selectedApplicationId,
  onSelectApplication,
  setTemplateAnchorDate,
  showScheduleModal,
  templateAnchorDate,
}: TrainingPlanTemplateSchedulingDialogProps) {
  const handleClose = () => {
    onScheduleModalOpenChange(false);
  };

  return showScheduleModal ? (
    <AppFormModal
      description={
        scheduleReview
          ? "Review the server-generated schedule before confirming."
          : "Choose how this plan should be applied, then pick the date anchor for the generated schedule."
      }
      onClose={handleClose}
      dismissDisabled={applyPending}
      primaryAction={
        <Button
          onPress={onApply}
          disabled={
            applyPending ||
            previewPending ||
            (!scheduleReview && (applicationsLoading || Boolean(applicationsError))) ||
            (scheduleReview !== null && !scheduleReview.preview.applicable)
          }
          testID="training-plan-schedule-confirm"
        >
          <Text className="text-primary-foreground font-semibold">
            {applyPending
              ? "Scheduling..."
              : previewPending
                ? "Reviewing..."
                : scheduleReview
                  ? "Confirm schedule"
                  : "Review schedule"}
          </Text>
        </Button>
      }
      secondaryAction={
        <Button
          variant="outline"
          disabled={applyPending}
          onPress={handleClose}
          testID="training-plan-schedule-cancel"
        >
          <Text className="text-foreground font-medium">Cancel</Text>
        </Button>
      }
      testID="training-plan-schedule-modal"
      title="Schedule this plan"
    >
      {previewPending ? (
        <Text accessibilityLiveRegion="polite">Preparing schedule review...</Text>
      ) : null}
      {scheduleError ? <Text accessibilityRole="alert">{scheduleError}</Text> : null}
      {applicationsLoading ? (
        <Text accessibilityLiveRegion="polite">Loading scheduled applications...</Text>
      ) : null}
      {applicationsError ? (
        <View>
          <Text accessibilityRole="alert">{applicationsError}</Text>
          <Button onPress={onRetryApplications}>
            <Text>Retry scheduled applications</Text>
          </Button>
        </View>
      ) : null}
      <View className="gap-2 rounded-2xl border border-border bg-card p-4">
        <Text className="text-sm font-medium text-foreground">How much of the plan?</Text>
        <View className="gap-2">
          <TouchableOpacity
            disabled={inputsLocked}
            onPress={() => onSelectScheduleApplicationMode("full")}
            className={`rounded-lg border px-3 py-3 ${scheduleApplicationMode === "full" ? "border-primary bg-primary/5" : "border-border bg-background"}`}
            activeOpacity={0.8}
            testID="training-plan-application-full"
          >
            <View className="flex-row items-start gap-3">
              <SelectionIndicator active={scheduleApplicationMode === "full"} />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-foreground">Full plan</Text>
                <Text className="mt-1 text-xs text-muted-foreground">
                  Schedule every available session from the beginning of the template.
                </Text>
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={inputsLocked}
            onPress={() => onSelectScheduleApplicationMode("remaining")}
            className={`rounded-lg border px-3 py-3 ${scheduleApplicationMode === "remaining" ? "border-primary bg-primary/5" : "border-border bg-background"}`}
            activeOpacity={0.8}
            testID="training-plan-application-remaining"
          >
            <View className="flex-row items-start gap-3">
              <SelectionIndicator active={scheduleApplicationMode === "remaining"} />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-foreground">Remaining only</Text>
                <Text className="mt-1 text-xs text-muted-foreground">
                  Keep the finish date and only schedule the sessions that still remain ahead.
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View className="gap-2 rounded-2xl border border-border bg-card p-4">
        <Text className="text-sm font-medium text-foreground">
          How should this schedule line up?
        </Text>
        <View className="gap-2">
          <TouchableOpacity
            onPress={() => onSelectScheduleAnchorMode("start")}
            className={`rounded-lg border px-3 py-3 ${scheduleAnchorMode === "start" ? "border-primary bg-primary/5" : "border-border bg-background"} ${scheduleApplicationMode === "remaining" ? "opacity-50" : ""}`}
            activeOpacity={0.8}
            disabled={inputsLocked || scheduleApplicationMode === "remaining"}
            testID="training-plan-anchor-start"
          >
            <View className="flex-row items-start gap-3">
              <SelectionIndicator active={scheduleAnchorMode === "start"} />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-foreground">Start On</Text>
                <Text className="mt-1 text-xs text-muted-foreground">
                  Put week 1 on a specific date.
                </Text>
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={inputsLocked}
            onPress={() => onSelectScheduleAnchorMode("finish")}
            className={`rounded-lg border px-3 py-3 ${scheduleAnchorMode === "finish" ? "border-primary bg-primary/5" : "border-border bg-background"}`}
            activeOpacity={0.8}
            testID="training-plan-anchor-finish"
          >
            <View className="flex-row items-start gap-3">
              <SelectionIndicator active={scheduleAnchorMode === "finish"} />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-foreground">Finish By</Text>
                <Text className="mt-1 text-xs text-muted-foreground">
                  Back-schedule the plan so the final session lands by a specific date.
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View className="rounded-2xl border border-border bg-card p-4">
        <DateField
          disabled={inputsLocked}
          id="apply-template-anchor-date"
          label={scheduleAnchorContent.fieldLabel}
          value={templateAnchorDate || undefined}
          onChange={(nextDate) => setTemplateAnchorDate(nextDate ?? "")}
          placeholder={scheduleAnchorContent.fieldPlaceholder}
          helperText={scheduleAnchorContent.helperText}
          clearable
          pickerPresentation="modal"
        />
      </View>
      <View className="gap-2 rounded-2xl border border-border bg-card p-4">
        <Text className="text-sm font-medium text-foreground">Scheduled application</Text>
        <TouchableOpacity
          disabled={inputsLocked || applicationsLoading || Boolean(applicationsError)}
          className={`rounded-lg border px-3 py-3 ${selectedApplicationId ? "border-border bg-background" : "border-primary bg-primary/5"}`}
          onPress={() => onSelectApplication("")}
          testID="training-plan-application-new"
        >
          <Text className="text-sm font-semibold text-foreground">New independent schedule</Text>
        </TouchableOpacity>
        {scheduledApplications.map((application) => (
          <TouchableOpacity
            disabled={inputsLocked || applicationsLoading || Boolean(applicationsError)}
            className={`rounded-lg border px-3 py-3 ${selectedApplicationId === application.application_id ? "border-primary bg-primary/5" : "border-border bg-background"}`}
            key={application.application_id}
            onPress={() => onSelectApplication(application.application_id)}
            testID={`training-plan-application-${application.application_id}`}
          >
            <Text className="text-sm font-semibold text-foreground">{application.start_date}</Text>
            <Text className="text-xs text-muted-foreground">
              {application.eligible_future_count} future session
              {application.eligible_future_count === 1 ? "" : "s"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {scheduleReview ? (
        <View className="gap-1 rounded-2xl border border-border bg-card p-4">
          <Text className="text-sm font-medium text-foreground">Schedule review</Text>
          <Text className="text-sm text-muted-foreground">
            {scheduleReview.preview.sessions.length} session
            {scheduleReview.preview.sessions.length === 1 ? "" : "s"} scheduled from{" "}
            {scheduleReview.preview.sessions[0]?.planningDate ?? "the server-selected date"}.
          </Text>
          {scheduleReview.preview.replacement ? (
            <Text className="text-sm text-muted-foreground">
              Replaces {scheduleReview.preview.replacement.affected.length} currently scheduled
              session
              {scheduleReview.preview.replacement.affected.length === 1 ? "" : "s"}.
            </Text>
          ) : null}
          {scheduleReview.preview.unresolved.length > 0 ? (
            <Text className="text-sm text-destructive">
              {scheduleReview.preview.unresolved.length} session
              {scheduleReview.preview.unresolved.length === 1 ? " needs" : "s need"} attention
              before confirmation.
            </Text>
          ) : null}
        </View>
      ) : null}
    </AppFormModal>
  ) : null;
}
