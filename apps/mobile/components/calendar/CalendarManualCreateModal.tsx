import { Button } from "@repo/ui/components/button";
import {
  Form,
  FormDateInputField,
  FormSwitchField,
  FormTextareaField,
  FormTextField,
  FormTimeInputField,
} from "@repo/ui/components/form";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, TouchableOpacity, View } from "react-native";
import { z } from "zod";

export type ManualEventCreateType = "race_target" | "custom";

type CalendarManualCreateFormValues = {
  title: string;
  notes: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  all_day: boolean;
};

const calendarManualCreateSchema = z.object({
  title: z.string().min(1),
  notes: z.string().nullable(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduled_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  all_day: z.boolean(),
});

type CalendarManualCreateModalProps = {
  visible: boolean;
  activeDate: string;
  createType: ManualEventCreateType | null;
  submitting: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (input: {
    createType: ManualEventCreateType;
    title: string;
    notes: string;
    startsAt: Date;
    allDay: boolean;
    recurrence?: { rule: string; timezone: string };
  }) => void;
};

function getRRuleWeekday(dateKey: string): string {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][day] ?? "MO";
}

function buildWeeklyRecurrence(dateKey: string, occurrenceCount: number) {
  return {
    rule: `FREQ=WEEKLY;INTERVAL=1;COUNT=${occurrenceCount};BYDAY=${getRRuleWeekday(dateKey)}`,
    timezone: "UTC",
  };
}

function buildInitialValues(
  activeDate: string,
  _createType: ManualEventCreateType,
): CalendarManualCreateFormValues {
  const startsAt = new Date(`${activeDate}T09:00:00.000Z`);

  return {
    title: "",
    notes: null,
    scheduled_date: activeDate,
    scheduled_time: format(startsAt, "HH:mm"),
    all_day: false,
  };
}

function buildStartsAt(input: {
  scheduledDate: string;
  scheduledTime: string | null;
  allDay: boolean;
}) {
  const [year, month, day] = input.scheduledDate.split("-").map(Number);
  const startsAt = new Date(
    year ?? 1970,
    (month ?? 1) - 1,
    day ?? 1,
    input.allDay ? 9 : 0,
    0,
    0,
    0,
  );

  if (!input.allDay && input.scheduledTime) {
    const [hours, minutes] = input.scheduledTime.split(":").map(Number);
    startsAt.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  }

  return startsAt;
}

function getManualCreateTitle(createType: ManualEventCreateType): string {
  switch (createType) {
    case "race_target":
      return "Create Race Target";
    case "custom":
      return "Create Custom Event";
  }
}

function getTitlePlaceholder(createType: ManualEventCreateType): string {
  switch (createType) {
    case "race_target":
      return "Race target";
    case "custom":
      return "Custom event";
  }
}

export function CalendarManualCreateModal({
  visible,
  activeDate,
  createType,
  submitting,
  errorMessage,
  onClose,
  onSubmit,
}: CalendarManualCreateModalProps) {
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatOccurrenceCount, setRepeatOccurrenceCount] = useState(4);
  const form = useZodForm({
    schema: calendarManualCreateSchema,
    defaultValues: buildInitialValues(activeDate, createType ?? "custom"),
  });

  const title = form.watch("title");
  const allDay = form.watch("all_day");

  useEffect(() => {
    if (!visible || !createType) {
      return;
    }

    form.reset(buildInitialValues(activeDate, createType));
    setRepeatWeekly(false);
    setRepeatOccurrenceCount(4);
  }, [activeDate, createType, form, visible]);

  const submitForm = useZodFormSubmit<CalendarManualCreateFormValues>({
    form,
    onSubmit: async (data) => {
      if (!createType) return;

      onSubmit({
        createType,
        title: data.title,
        notes: data.notes ?? "",
        startsAt: buildStartsAt({
          scheduledDate: data.scheduled_date,
          scheduledTime: data.scheduled_time,
          allDay: data.all_day,
        }),
        allDay: data.all_day,
        recurrence: repeatWeekly
          ? buildWeeklyRecurrence(data.scheduled_date, repeatOccurrenceCount)
          : undefined,
      });
    },
  });

  const canSubmit = !!createType && !submitting && title.trim().length > 0;
  const submitButtonState = submitForm.getSubmitButtonState({
    disabled: !canSubmit,
    label: "Create Event",
    submittingLabel: "Creating...",
  });

  if (!visible || !createType) {
    return null;
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-background">
        <View className="flex-row items-center justify-between border-b border-border px-4 py-4">
          <Text className="text-lg font-semibold">{getManualCreateTitle(createType)}</Text>
          <TouchableOpacity
            onPress={onClose}
            className="rounded-md bg-muted px-3 py-2"
            activeOpacity={0.8}
            testID="close-manual-create"
          >
            <Text className="text-xs">Close</Text>
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1">
          <View className="gap-4 px-4 py-4" testID="manual-create-modal">
            <Form {...form}>
              <View className="gap-4">
                <FormTextField
                  control={form.control}
                  disabled={submitting}
                  label="Title"
                  name="title"
                  placeholder={getTitlePlaceholder(createType)}
                  testId="manual-create-title-input"
                />

                <FormDateInputField
                  accessibilityHint="Choose the day for this event"
                  control={form.control}
                  disabled={submitting}
                  label="Date"
                  name="scheduled_date"
                  pickerPresentation="modal"
                  testId="manual-create-date-button"
                />

                <FormSwitchField
                  control={form.control}
                  disabled={submitting}
                  label="All day"
                  name="all_day"
                  switchLabel="All day"
                  testId="manual-create-all-day-toggle"
                />

                {!allDay ? (
                  <FormTimeInputField
                    accessibilityHint="Choose the start time for this event"
                    control={form.control}
                    disabled={submitting}
                    label="Time"
                    name="scheduled_time"
                    pickerPresentation="modal"
                    testId="manual-create-time-button"
                  />
                ) : null}

                <FormTextareaField
                  control={form.control}
                  disabled={submitting}
                  formatValue={(value) => value ?? ""}
                  label="Notes (optional)"
                  name="notes"
                  parseValue={(value) => value || null}
                  placeholder="Add notes"
                  testId="manual-create-notes-input"
                />

                <View className="rounded-xl border border-border bg-card px-3 py-3">
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="flex-1 gap-1">
                      <Text className="text-sm font-medium text-foreground">Repeat weekly</Text>
                      <Text className="text-xs text-muted-foreground">
                        Create this event every week on the selected day.
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="switch"
                      accessibilityState={{ checked: repeatWeekly }}
                      className={`rounded-full px-3 py-2 ${repeatWeekly ? "bg-primary" : "bg-muted"}`}
                      disabled={submitting}
                      onPress={() => setRepeatWeekly((current) => !current)}
                      testID="manual-create-repeat-weekly-toggle"
                    >
                      <Text
                        className={`text-xs font-semibold ${repeatWeekly ? "text-primary-foreground" : "text-foreground"}`}
                      >
                        {repeatWeekly ? "On" : "Off"}
                      </Text>
                    </Pressable>
                  </View>

                  {repeatWeekly ? (
                    <View className="mt-3 gap-2 border-t border-border pt-3">
                      <Text className="text-xs font-medium text-muted-foreground">
                        Ends after {repeatOccurrenceCount} occurrences
                      </Text>
                      <View className="flex-row gap-2">
                        <Pressable
                          className="rounded-md border border-border px-3 py-2"
                          disabled={submitting || repeatOccurrenceCount <= 2}
                          onPress={() =>
                            setRepeatOccurrenceCount((current) => Math.max(2, current - 1))
                          }
                          testID="manual-create-repeat-count-decrement"
                        >
                          <Text className="text-sm text-foreground">-</Text>
                        </Pressable>
                        <Pressable
                          className="rounded-md border border-border px-3 py-2"
                          disabled={submitting || repeatOccurrenceCount >= 52}
                          onPress={() =>
                            setRepeatOccurrenceCount((current) => Math.min(52, current + 1))
                          }
                          testID="manual-create-repeat-count-increment"
                        >
                          <Text className="text-sm text-foreground">+</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
            </Form>

            {errorMessage ? (
              <View className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
                <Text className="text-xs text-destructive">{errorMessage}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <View className="border-t border-border px-4 py-4">
          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={onClose} disabled={submitting}>
              <Text>Cancel</Text>
            </Button>
            <LoadingButton
              className="flex-1"
              onPress={submitForm.handleSubmit}
              disabled={submitButtonState.disabled}
              loading={submitting || submitButtonState.loading}
              loadingLabel={submitButtonState.loadingLabel}
              testID="manual-create-submit"
            >
              <Text className="text-primary-foreground">{submitButtonState.label}</Text>
            </LoadingButton>
          </View>
        </View>
      </View>
    </Modal>
  );
}
