import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import React, { useMemo, useState } from "react";
import { formatDateOnly, parseDateOnlyToDate } from "../../lib/fitness-inputs";
import { Modal, Platform, Pressable, View } from "../../lib/react-native";
import { Button } from "../button/index.native";
import { Label } from "../label/index.native";
import { Text } from "../text/index.native";
import type { DateInputProps } from "./shared";

function DateInput({
  accessibilityHint,
  clearable = false,
  error,
  helperText,
  id,
  label,
  maximumDate,
  minimumDate,
  onChange,
  pickerPresentation = "inline",
  placeholder = "Select date",
  required = false,
  value,
}: DateInputProps) {
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [draftDate, setDraftDate] = useState(() => parseDateOnlyToDate(value));

  const selectedDate = useMemo(() => parseDateOnlyToDate(value), [value]);
  const usesModalPresentation = pickerPresentation === "modal";
  const formattedValue = value ? format(selectedDate, "EEE, MMM d, yyyy") : placeholder;

  const commitSelectedDate = (nextDate: Date) => {
    onChange(formatDateOnly(nextDate));
  };

  const handleInlineDateChange = (event: DateTimePickerEvent, selected?: Date) => {
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

  return (
    <View className="gap-2">
      <Label nativeID={id}>
        <Text className="text-sm font-medium text-foreground">
          {label}
          {required ? <Text className="text-destructive"> *</Text> : null}
        </Text>
      </Label>
      <Pressable
        accessibilityHint={accessibilityHint ?? "Opens date picker. Format yyyy-mm-dd"}
        accessibilityLabel={label}
        accessibilityRole="button"
        className={`rounded-md border px-3 py-3 ${error ? "border-destructive bg-destructive/5" : "border-input bg-background"}`}
        onPress={handleOpenPicker}
      >
        <Text className="text-foreground">{formattedValue}</Text>
      </Pressable>
      {isPickerVisible && !usesModalPresentation ? (
        <DateTimePicker
          display="default"
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          mode="date"
          onChange={handleInlineDateChange}
          value={selectedDate}
        />
      ) : null}
      {usesModalPresentation && Platform.OS !== "android" ? (
        <Modal
          animationType="fade"
          onRequestClose={() => setIsPickerVisible(false)}
          transparent
          visible={isPickerVisible}
        >
          <View className="flex-1 items-center justify-center bg-black/40 px-5">
            <View className="w-full max-w-md gap-4 rounded-2xl bg-background p-4">
              <DateTimePicker
                display="spinner"
                maximumDate={maximumDate}
                minimumDate={minimumDate}
                mode="date"
                onChange={(_event, nextDate) => {
                  if (nextDate) {
                    setDraftDate(nextDate);
                  }
                }}
                value={draftDate}
              />
              <View className="flex-row justify-end gap-2">
                <Button variant="outline" onPress={() => setIsPickerVisible(false)}>
                  <Text>Cancel</Text>
                </Button>
                <Button
                  onPress={() => {
                    onChange(formatDateOnly(draftDate));
                    setIsPickerVisible(false);
                  }}
                >
                  <Text className="text-primary-foreground">Done</Text>
                </Button>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
      {helperText ? <Text className="text-xs text-muted-foreground">{helperText}</Text> : null}
      {clearable && value ? (
        <Button variant="outline" size="sm" onPress={() => onChange(undefined)}>
          <Text>Clear date</Text>
        </Button>
      ) : null}
      {error ? <Text className="text-xs text-destructive">Adjust this field: {error}</Text> : null}
    </View>
  );
}

export { DateInput };
