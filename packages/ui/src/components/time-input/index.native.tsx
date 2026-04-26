import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import React, { useMemo, useState } from "react";
import { Modal, Platform, Pressable, View } from "../../lib/react-native";
import { getNativeTestProps } from "../../lib/test-props";
import { Button } from "../button/index.native";
import { Label } from "../label/index.native";
import { Text } from "../text/index.native";
import type { TimeInputProps } from "./shared";

function parseTimeValue(value: string | undefined) {
  const date = new Date();
  date.setSeconds(0, 0);

  if (!value) {
    return date;
  }

  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return date;
  }

  const [, hours, minutes] = match;
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return date;
}

function formatTimeValue(value: Date) {
  return format(value, "HH:mm");
}

function TimeInput({
  accessibilityHint,
  clearable = false,
  error,
  helperText,
  id,
  is24Hour,
  label,
  onChange,
  pickerPresentation = "inline",
  placeholder = "Select time",
  required = false,
  testId,
  value,
}: TimeInputProps) {
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [draftTime, setDraftTime] = useState(() => parseTimeValue(value));

  const selectedTime = useMemo(() => parseTimeValue(value), [value]);
  const usesModalPresentation = pickerPresentation === "modal";
  const formattedValue = value ? format(selectedTime, is24Hour ? "HH:mm" : "h:mm a") : placeholder;
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel: label,
    id,
    testId,
  });

  const commitSelectedTime = (nextTime: Date) => {
    onChange(formatTimeValue(nextTime));
  };

  const handleInlineTimeChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (event.type === "dismissed") {
      setIsPickerVisible(false);
      return;
    }

    if (selected) {
      commitSelectedTime(selected);
    }

    setIsPickerVisible(false);
  };

  const handleOpenPicker = () => {
    if (usesModalPresentation && Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: selectedTime,
        mode: "time",
        is24Hour,
        onChange: (_event, nextTime) => {
          if (nextTime) {
            commitSelectedTime(nextTime);
          }
        },
      });
      return;
    }

    if (usesModalPresentation) {
      setDraftTime(selectedTime);
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
        accessibilityHint={accessibilityHint ?? "Opens time picker. Format hh:mm"}
        accessibilityRole="button"
        className={`rounded-md border px-3 py-3 ${error ? "border-destructive bg-destructive/5" : "border-input bg-background"}`}
        onPress={handleOpenPicker}
        {...nativeTestProps}
      >
        <Text className="text-foreground">{formattedValue}</Text>
      </Pressable>
      {isPickerVisible && !usesModalPresentation ? (
        <DateTimePicker
          display="default"
          is24Hour={is24Hour}
          mode="time"
          onChange={handleInlineTimeChange}
          value={selectedTime}
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
                is24Hour={is24Hour}
                mode="time"
                onChange={(_event, nextTime) => {
                  if (nextTime) {
                    setDraftTime(nextTime);
                  }
                }}
                value={draftTime}
              />
              <View className="flex-row justify-end gap-2">
                <Button variant="outline" onPress={() => setIsPickerVisible(false)}>
                  <Text>Cancel</Text>
                </Button>
                <Button
                  onPress={() => {
                    onChange(formatTimeValue(draftTime));
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
          <Text>Clear time</Text>
        </Button>
      ) : null}
      {error ? <Text className="text-xs text-destructive">Adjust this field: {error}</Text> : null}
    </View>
  );
}

export { TimeInput };
