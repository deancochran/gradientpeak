import { Button } from "@repo/ui/components/button";
import { DateInput as DateField } from "@repo/ui/components/date-input";
import { Text } from "@repo/ui/components/text";
import { TouchableOpacity, View } from "react-native";
import { AppConfirmModal, AppFormModal } from "@/components/shared/AppFormModal";

type ScheduleAnchorMode = "start" | "finish";
type ScheduleApplicationMode = "full" | "remaining";

interface TrainingPlanTemplateSchedulingDialogProps {
  applyPending: boolean;
  onApply: () => void;
  onConcurrencyOpenChange: (open: boolean) => void;
  onOpenActivePlan: () => void;
  onReplaceScheduledPlan: () => void;
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
  setTemplateAnchorDate: (value: string) => void;
  showConcurrencyWarning: boolean;
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
  onApply,
  onConcurrencyOpenChange,
  onOpenActivePlan,
  onReplaceScheduledPlan,
  onScheduleModalOpenChange,
  onSelectScheduleApplicationMode,
  onSelectScheduleAnchorMode,
  scheduleApplicationMode,
  scheduleAnchorContent,
  scheduleAnchorMode,
  setTemplateAnchorDate,
  showConcurrencyWarning,
  showScheduleModal,
  templateAnchorDate,
}: TrainingPlanTemplateSchedulingDialogProps) {
  const handleClose = () => {
    onConcurrencyOpenChange(false);
    onScheduleModalOpenChange(false);
  };

  const handleOpenCurrentPlan = () => {
    onConcurrencyOpenChange(false);
    onOpenActivePlan();
  };

  return (
    <>
      {showScheduleModal ? (
        <AppFormModal
          description="Choose how this plan should be applied, then pick the date anchor for the generated schedule."
          onClose={handleClose}
          primaryAction={
            <Button
              onPress={onApply}
              disabled={applyPending}
              testID="training-plan-schedule-confirm"
            >
              <Text className="text-primary-foreground font-semibold">
                {applyPending ? "Scheduling..." : "Schedule"}
              </Text>
            </Button>
          }
          secondaryAction={
            <Button variant="outline" onPress={handleClose} testID="training-plan-schedule-cancel">
              <Text className="text-foreground font-medium">Cancel</Text>
            </Button>
          }
          testID="training-plan-schedule-modal"
          title="Schedule this plan"
        >
          <View className="gap-2 rounded-2xl border border-border bg-card p-4">
            <Text className="text-sm font-medium text-foreground">How much of the plan?</Text>
            <View className="gap-2">
              <TouchableOpacity
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
                disabled={scheduleApplicationMode === "remaining"}
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
        </AppFormModal>
      ) : null}

      {showConcurrencyWarning ? (
        <AppConfirmModal
          description="Replacing it will remove the current scheduled set while keeping completed history."
          onClose={handleClose}
          primaryAction={{
            label: "Replace Scheduled Plan",
            onPress: onReplaceScheduledPlan,
            testID: "training-plan-replace-confirm",
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: handleClose,
            variant: "outline",
          }}
          tertiaryAction={{
            label: "Open Current Plan",
            onPress: handleOpenCurrentPlan,
            variant: "outline",
          }}
          testID="training-plan-replace-modal"
          title="Current plan already scheduled"
        />
      ) : null}
    </>
  );
}
