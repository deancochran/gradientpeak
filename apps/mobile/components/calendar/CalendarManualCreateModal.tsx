import {
  DEFAULT_WEEKLY_COUNT_RECURRENCE,
  serializeWeeklyCountRecurrence,
  type WeeklyCountRecurrence,
} from "@repo/core/recurrence";
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
import { RecurrenceFields } from "@repo/ui/components/recurrence-fields";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { Modal, ScrollView, TouchableOpacity, View } from "react-native";
import { z } from "zod";
import { InlineNotice } from "@/components/shared/LayoutPrimitives";
import { dateKeyToLocalDate, getDeviceTimeZone } from "@/lib/calendar/eventSchedule";

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
    scheduledDate: string;
    startsAt: Date;
    allDay: boolean;
    timezone: string;
    recurrence?: { rule: string; timezone: string };
  }) => void;
};

function buildInitialValues(
  activeDate: string,
  _createType: ManualEventCreateType,
): CalendarManualCreateFormValues {
  const startsAt = dateKeyToLocalDate(activeDate, 9);

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
  const [scheduledHours, scheduledMinutes] = input.scheduledTime?.split(":").map(Number) ?? [];

  return new Date(
    year ?? 1970,
    (month ?? 1) - 1,
    day ?? 1,
    input.allDay ? 9 : (scheduledHours ?? 0),
    input.allDay ? 0 : (scheduledMinutes ?? 0),
    0,
    0,
  );
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
  const [recurrence, setRecurrence] = useState<WeeklyCountRecurrence>({
    ...DEFAULT_WEEKLY_COUNT_RECURRENCE,
  });
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
    setRecurrence({ ...DEFAULT_WEEKLY_COUNT_RECURRENCE });
  }, [activeDate, createType, form, visible]);

  const submitForm = useZodFormSubmit<CalendarManualCreateFormValues>({
    form,
    onSubmit: async (data) => {
      if (!createType) return;

      const startsAt = buildStartsAt({
        scheduledDate: data.scheduled_date,
        scheduledTime: data.scheduled_time,
        allDay: data.all_day,
      });

      onSubmit({
        createType,
        title: data.title,
        notes: data.notes ?? "",
        scheduledDate: data.scheduled_date,
        startsAt,
        allDay: data.all_day,
        timezone: getDeviceTimeZone(),
        recurrence: serializeWeeklyCountRecurrence({
          recurrence,
          startInstant: startsAt,
        }),
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
            <Text className="text-xs text-foreground">Close</Text>
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

                <RecurrenceFields
                  disabled={submitting}
                  onChange={setRecurrence}
                  testIdPrefix="manual-create"
                  value={recurrence}
                />
              </View>
            </Form>

            {errorMessage ? <InlineNotice tone="error">{errorMessage}</InlineNotice> : null}
          </View>
        </ScrollView>

        <View className="border-t border-border px-4 py-4">
          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={onClose} disabled={submitting}>
              <Text className="text-foreground">Cancel</Text>
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
