import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import {
  formatDateOnly,
  parseDateOnlyToDate,
} from "@/lib/training-plan-form/input-parsers";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import React, { useMemo, useState } from "react";
import { Pressable, View } from "react-native";

interface DateFieldProps {
  id: string;
  label: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  helperText?: string;
  error?: string;
  required?: boolean;
  minimumDate?: Date;
  placeholder?: string;
  clearable?: boolean;
  accessibilityHint?: string;
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
  placeholder = "Select date",
  clearable = false,
  accessibilityHint,
}: DateFieldProps) {
  const [isPickerVisible, setIsPickerVisible] = useState(false);

  const selectedDate = useMemo(() => parseDateOnlyToDate(value), [value]);
  const formattedValue = value
    ? format(selectedDate, "EEE, MMM d, yyyy")
    : placeholder;

  const handleDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (event.type === "dismissed") {
      setIsPickerVisible(false);
      return;
    }

    if (selected) {
      onChange(formatDateOnly(selected));
    }
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
        onPress={() => setIsPickerVisible(true)}
        className="rounded-md border border-input bg-background px-3 py-3"
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={
          accessibilityHint ?? "Opens date picker. Format yyyy-mm-dd"
        }
      >
        <Text>{formattedValue}</Text>
      </Pressable>
      {isPickerVisible ? (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          minimumDate={minimumDate}
          onChange={handleDateChange}
        />
      ) : null}
      {helperText ? (
        <Text className="text-xs text-muted-foreground">{helperText}</Text>
      ) : null}
      {clearable && value ? (
        <Button variant="outline" size="sm" onPress={() => onChange(undefined)}>
          <Text>Clear date</Text>
        </Button>
      ) : null}
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}
