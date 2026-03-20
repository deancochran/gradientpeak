import { Button } from "@repo/ui/components/button";
import { Label } from "@repo/ui/components/label";
import { Text } from "@repo/ui/components/text";
import {
  formatDateOnly,
  parseDateOnlyToDate,
} from "@/lib/training-plan-form/input-parsers";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import type { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import React, { useMemo, useState } from "react";
import { Modal, Platform, Pressable, View } from "react-native";

interface DateFieldProps {
  id: string;
  label: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  helperText?: string;
  error?: string;
  required?: boolean;
  minimumDate?: Date;
  maximumDate?: Date;
  placeholder?: string;
  clearable?: boolean;
  accessibilityHint?: string;
  pickerPresentation?: "inline" | "modal";
}

export function DateField({
  id,
  label,
  value,
  onChange,
  helperText,
  error,
  required = false,
  minimumDate,
  maximumDate,
  placeholder = "Select date",
  clearable = false,
  accessibilityHint,
  pickerPresentation = "inline",
}: DateFieldProps) {
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [draftDate, setDraftDate] = useState(() => parseDateOnlyToDate(value));

  const selectedDate = useMemo(() => parseDateOnlyToDate(value), [value]);
  const usesModalPresentation = pickerPresentation === "modal";
  const formattedValue = value
    ? format(selectedDate, "EEE, MMM d, yyyy")
    : placeholder;

  const commitSelectedDate = (nextDate: Date) => {
    onChange(formatDateOnly(nextDate));
  };

  const handleInlineDateChange = (
    event: DateTimePickerEvent,
    selected?: Date,
  ) => {
    if (event.type === "dismissed") {
      setIsPickerVisible(false);
      return;
    }

    if (selected) {
      commitSelectedDate(selected);
    }
    setIsPickerVisible(false);
  };

  const handleOpenPicker = () => {
    if (usesModalPresentation && Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: selectedDate,
        mode: "date",
        minimumDate,
        maximumDate,
        onChange: (_event, nextDate) => {
          if (nextDate) {
            commitSelectedDate(nextDate);
          }
        },
      });
      return;
    }

    if (usesModalPresentation) {
      setDraftDate(selectedDate);
    }

    setIsPickerVisible(true);
  };

  const handleConfirmModalDate = () => {
    commitSelectedDate(draftDate);
    setIsPickerVisible(false);
  };

  return (
    <View className="gap-2">
      <Label nativeID={id}>
        <Text className="text-sm font-medium">
          {label}
          {required ? <Text className="text-destructive"> *</Text> : null}
        </Text>
      </Label>
      <Pressable
        onPress={handleOpenPicker}
        className={`rounded-md border px-3 py-3 ${error ? "border-destructive bg-destructive/5" : "border-input bg-background"}`}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={
          accessibilityHint ?? "Opens date picker. Format yyyy-mm-dd"
        }
      >
        <Text>{formattedValue}</Text>
      </Pressable>
      {isPickerVisible && !usesModalPresentation ? (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={handleInlineDateChange}
        />
      ) : null}
      {usesModalPresentation && Platform.OS !== "android" ? (
        <Modal
          animationType="fade"
          transparent
          visible={isPickerVisible}
          onRequestClose={() => setIsPickerVisible(false)}
        >
          <View className="flex-1 items-center justify-center bg-black/40 px-5">
            <View className="w-full max-w-md rounded-2xl bg-background p-4 gap-4">
              <View className="gap-1">
                <Text className="text-base font-semibold text-foreground">
                  {label}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Choose a date, then confirm to use it.
                </Text>
              </View>
              <DateTimePicker
                value={draftDate}
                mode="date"
                display="spinner"
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                onChange={(_event, nextDate) => {
                  if (nextDate) {
                    setDraftDate(nextDate);
                  }
                }}
              />
              <View className="flex-row justify-end gap-2">
                <Button
                  variant="outline"
                  onPress={() => setIsPickerVisible(false)}
                >
                  <Text>Cancel</Text>
                </Button>
                <Button onPress={handleConfirmModalDate}>
                  <Text className="text-primary-foreground">Done</Text>
                </Button>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
      {helperText ? (
        <Text className="text-xs text-muted-foreground">{helperText}</Text>
      ) : null}
      {clearable && value ? (
        <Button variant="outline" size="sm" onPress={() => onChange(undefined)}>
          <Text>Clear date</Text>
        </Button>
      ) : null}
      {error ? (
        <Text className="text-xs text-destructive">
          Adjust this field: {error}
        </Text>
      ) : null}
    </View>
  );
}
