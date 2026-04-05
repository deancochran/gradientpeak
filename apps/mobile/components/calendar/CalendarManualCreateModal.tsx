import DateTimePicker from "@react-native-community/datetimepicker";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Switch } from "@repo/ui/components/switch";
import { Text } from "@repo/ui/components/text";
import { Textarea } from "@repo/ui/components/textarea";
import { format } from "date-fns";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, ScrollView, TouchableOpacity, View } from "react-native";

export type ManualEventCreateType = "race_target" | "custom";

type CalendarManualCreateFormValues = {
  title: string;
  notes: string;
  startsAt: Date;
  allDay: boolean;
};

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
  }) => void;
};

function buildInitialValues(
  activeDate: string,
  createType: ManualEventCreateType,
): CalendarManualCreateFormValues {
  return {
    title: "",
    notes: "",
    startsAt: new Date(`${activeDate}T09:00:00.000Z`),
    allDay: false,
  };
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
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [startsAt, setStartsAt] = useState(new Date());
  const [allDay, setAllDay] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    if (!visible || !createType) {
      setShowDatePicker(false);
      setShowTimePicker(false);
      return;
    }

    const initialValues = buildInitialValues(activeDate, createType);
    setTitle(initialValues.title);
    setNotes(initialValues.notes);
    setStartsAt(initialValues.startsAt);
    setAllDay(initialValues.allDay);
    setShowDatePicker(false);
    setShowTimePicker(false);
  }, [activeDate, createType, visible]);

  const handleDateChange = useCallback(
    (_: unknown, nextDate?: Date) => {
      setShowDatePicker(false);
      if (!nextDate) return;

      const updatedDate = new Date(startsAt);
      updatedDate.setFullYear(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
      setStartsAt(updatedDate);
    },
    [startsAt],
  );

  const handleTimeChange = useCallback(
    (_: unknown, nextDate?: Date) => {
      setShowTimePicker(false);
      if (!nextDate) return;

      const updatedDate = new Date(startsAt);
      updatedDate.setHours(nextDate.getHours(), nextDate.getMinutes(), 0, 0);
      setStartsAt(updatedDate);
    },
    [startsAt],
  );

  const canSubmit = useMemo(
    () => !!createType && !submitting && title.trim().length > 0,
    [createType, submitting, title],
  );

  const handleSubmit = useCallback(() => {
    if (!createType) return;

    onSubmit({
      createType,
      title,
      notes,
      startsAt,
      allDay,
    });
  }, [allDay, createType, notes, onSubmit, startsAt, title]);

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
            <View>
              <Text className="mb-2 text-sm font-medium">Title</Text>
              <Input
                value={title}
                onChangeText={setTitle}
                placeholder={getTitlePlaceholder(createType)}
                editable={!submitting}
                testID="manual-create-title-input"
              />
            </View>

            <View>
              <Text className="mb-2 text-sm font-medium">Date</Text>
              <TouchableOpacity
                onPress={() => setShowDatePicker(true)}
                className="rounded-md border border-border bg-card px-3 py-3"
                activeOpacity={0.8}
                testID="manual-create-date-button"
              >
                <Text className="text-sm">{format(startsAt, "EEEE, MMM d, yyyy")}</Text>
              </TouchableOpacity>
            </View>

            <View className="gap-2">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-medium">All day</Text>
                <Switch
                  checked={allDay}
                  onCheckedChange={setAllDay}
                  testID="manual-create-all-day-toggle"
                />
              </View>
              {!allDay ? (
                <TouchableOpacity
                  onPress={() => setShowTimePicker(true)}
                  className="rounded-md border border-border bg-card px-3 py-3"
                  activeOpacity={0.8}
                  testID="manual-create-time-button"
                >
                  <Text className="text-sm">{format(startsAt, "h:mm a")}</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View>
              <Text className="mb-2 text-sm font-medium">Notes (optional)</Text>
              <Textarea
                value={notes}
                onChangeText={setNotes}
                placeholder="Add notes"
                editable={!submitting}
                testID="manual-create-notes-input"
              />
            </View>

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
            <Button
              className="flex-1"
              onPress={handleSubmit}
              disabled={!canSubmit}
              testID="manual-create-submit"
            >
              <Text className="text-primary-foreground">
                {submitting ? "Creating..." : "Create Event"}
              </Text>
            </Button>
          </View>
        </View>

        {showDatePicker ? (
          <DateTimePicker
            value={startsAt}
            mode="date"
            display="default"
            onChange={handleDateChange}
          />
        ) : null}
        {showTimePicker ? (
          <DateTimePicker
            value={startsAt}
            mode="time"
            display="default"
            onChange={handleTimeChange}
          />
        ) : null}
      </View>
    </Modal>
  );
}
