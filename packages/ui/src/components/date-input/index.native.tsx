import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatDateOnly, parseDateOnlyToDate } from "../../lib/fitness-inputs";
import { Modal, Platform, Pressable, View } from "../../lib/react-native";
import { getNativeTestProps } from "../../lib/test-props";
import { Button } from "../button/index.native";
import { Label } from "../label/index.native";
import { Text } from "../text/index.native";
import type { DateInputProps } from "./shared";

function DateInput({
  accessibilityHint,
  clearable = false,
  disabled = false,
  error,
  helperText,
  id,
  label,
  maximumDate,
  minimumDate,
  name: _name,
  onChange,
  pickerPresentation = "modal",
  placeholder = "Select date",
  required = false,
  testId,
  value,
}: DateInputProps) {
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [draftDate, setDraftDate] = useState(() => parseDateOnlyToDate(value));
  const disabledRef = useRef(disabled);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  const selectedDate = useMemo(() => parseDateOnlyToDate(value), [value]);
  const usesModalPresentation = pickerPresentation === "modal";
  const formattedValue = value ? format(selectedDate, "EEE, MMM d, yyyy") : placeholder;
  const fieldHint = [
    required ? "Required" : undefined,
    accessibilityHint ?? "Opens date picker. Format yyyy-mm-dd",
    helperText,
    error ? `Error: ${error}` : undefined,
  ]
    .filter(Boolean)
    .join(". ");
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel: label,
    id,
    testId,
  });

  const commitSelectedDate = (nextDate: Date) => {
    if (disabledRef.current) {
      return;
    }

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
    if (disabled) {
      return;
    }

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
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityHint={fieldHint}
          aria-invalid={!!error}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          aria-required={required}
          className={`flex-1 rounded-md border px-3 py-3 ${disabled ? "opacity-50" : ""} ${error ? "border-destructive bg-destructive/5" : "border-input bg-background"}`}
          disabled={disabled}
          onPress={handleOpenPicker}
          {...nativeTestProps}
        >
          <Text className="text-foreground">{formattedValue}</Text>
        </Pressable>
        {clearable && value ? (
          <Button
            accessibilityLabel="Clear date"
            disabled={disabled}
            variant="ghost"
            size="sm"
            onPress={() => {
              if (!disabled) {
                onChange(undefined);
              }
            }}
          >
            <Text className="text-muted-foreground">Clear</Text>
          </Button>
        ) : null}
      </View>
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
      {usesModalPresentation && Platform.OS !== "android" && isPickerVisible ? (
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
                  if (!disabled && nextDate) {
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
                    if (disabled) {
                      return;
                    }

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
      {error ? <Text className="text-xs text-destructive">Adjust this field: {error}</Text> : null}
    </View>
  );
}

export { DateInput };
