import { Button } from "@repo/ui/components/button";
import { DateInput as DateField } from "@repo/ui/components/date-input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/dialog";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";
import { Text } from "@repo/ui/components/text";
import React from "react";
import { TouchableOpacity, View } from "react-native";

type ScheduleAnchorMode = "start" | "finish";

interface TrainingPlanTemplateSchedulingDialogProps {
  applyPending: boolean;
  onApply: () => void;
  onConcurrencyOpenChange: (open: boolean) => void;
  onOpenActivePlan: () => void;
  onScheduleModalOpenChange: (open: boolean) => void;
  onSelectScheduleAnchorMode: (mode: ScheduleAnchorMode) => void;
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

export function TrainingPlanTemplateSchedulingDialog({
  applyPending,
  onApply,
  onConcurrencyOpenChange,
  onOpenActivePlan,
  onScheduleModalOpenChange,
  onSelectScheduleAnchorMode,
  scheduleAnchorContent,
  scheduleAnchorMode,
  setTemplateAnchorDate,
  showConcurrencyWarning,
  showScheduleModal,
  templateAnchorDate,
}: TrainingPlanTemplateSchedulingDialogProps) {
  return (
    <>
      <Dialog open={showScheduleModal} onOpenChange={onScheduleModalOpenChange}>
        <DialogTrigger asChild>
          <Button className="w-full" testID="training-plan-schedule-button">
            <Text className="text-primary-foreground font-semibold">Schedule Sessions</Text>
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Schedule this plan</DialogTitle>
            <DialogDescription>
              Choose one anchor for this schedule. You can either place week 1 on a date or finish
              the whole plan by a date.
            </DialogDescription>
          </DialogHeader>
          <View className="gap-4 py-4">
            <View className="gap-2">
              <Text className="text-sm font-medium">How should this schedule line up?</Text>
              <RadioGroup
                value={scheduleAnchorMode}
                onValueChange={(nextValue) => {
                  if (nextValue === "start" || nextValue === "finish") {
                    onSelectScheduleAnchorMode(nextValue);
                  }
                }}
              >
                <TouchableOpacity
                  onPress={() => onSelectScheduleAnchorMode("start")}
                  className={`rounded-lg border px-3 py-3 ${scheduleAnchorMode === "start" ? "border-primary bg-primary/5" : "border-border bg-background"}`}
                  activeOpacity={0.8}
                  testID="training-plan-anchor-start"
                >
                  <View className="flex-row items-start gap-3">
                    <RadioGroupItem value="start" />
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
                    <RadioGroupItem value="finish" />
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-foreground">Finish By</Text>
                      <Text className="mt-1 text-xs text-muted-foreground">
                        Back-schedule the plan so the final session lands by a specific date.
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </RadioGroup>
            </View>
            <View className="gap-2">
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
          </View>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" testID="training-plan-schedule-cancel">
                <Text className="text-foreground font-medium">Cancel</Text>
              </Button>
            </DialogClose>
            <Button
              onPress={onApply}
              disabled={applyPending}
              testID="training-plan-schedule-confirm"
            >
              <Text className="text-primary-foreground font-semibold">
                {applyPending ? "Scheduling..." : "Schedule Sessions"}
              </Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showConcurrencyWarning} onOpenChange={onConcurrencyOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Current plan already scheduled</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            You already have scheduled sessions from a training plan. Finish or abandon that plan
            before scheduling another one.
          </DialogDescription>
          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button variant="outline">
                <Text className="text-foreground font-medium">Cancel</Text>
              </Button>
            </DialogClose>
            <Button onPress={onOpenActivePlan}>
              <Text className="text-primary-foreground font-semibold">Open Current Plan</Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
