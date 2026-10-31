import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { formatLocalDateOnly, parseDateOnlyToDate } from "@repo/core/utils/fitness-inputs";
import { format } from "date-fns";
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, findNodeHandle, Modal, Platform, Pressable, View } from "react-native";
import {
  type NativeInputSession,
  useNativeInputHandoff,
} from "../../hooks/use-native-input-handoff";
import { omitUndefined } from "../../lib/omit-undefined";
import { getNativeTestProps } from "../../lib/test-props";
import { Button } from "../button/index.native";
import { Label } from "../label/index.native";
import { Text } from "../text/index.native";
import type { DateInputProps } from "./shared";

function DateInput({
  ref,
  onBlur,
  resetKey,
  formControl,
  accessibilityHint,
  clearable = false,
  disabled = false,
  error,
  helperText,
  id,
  label,
  maximumDate,
  minimumDate,
  name,
  onChange,
  pickerPresentation = "modal",
  placeholder = "Select date",
  required = false,
  testId,
  value,
}: DateInputProps) {
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [draftDate, setDraftDate] = useState<Date | null>(() => parseDateOnlyToDate(value) ?? null);
  const trigger = useRef<View>(null);
  const focus = () => {
    trigger.current?.focus?.();
    const node = findNodeHandle(trigger.current);
    if (node != null) AccessibilityInfo.setAccessibilityFocus(node);
  };
  useImperativeHandle(ref, () => ({ focus }));
  const identity = JSON.stringify([resetKey, id, name, pickerPresentation]);
  const handoff = useNativeInputHandoff({
    disabled,
    identity,
    owner: formControl,
    focus,
    onSuperseded: () => {
      if (Platform.OS === "android" && sessionRef.current)
        void DateTimePickerAndroid.dismiss("date");
      setIsPickerVisible(false);
      setDraftDate(null);
      setSession(null);
    },
  });
  const usable = handoff.usable;
  const [session, setSession] = useState<NativeInputSession | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const closePicker = (ticket: NativeInputSession) => {
    if (sessionRef.current !== ticket) return;
    ticket.close();
    setIsPickerVisible(false);
    if (usable()) onBlur?.();
    if (Platform.OS === "android" || pickerPresentation !== "modal")
      requestAnimationFrame(ticket.restoreFocus);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit reset invalidates an open picker even when the date is unchanged.
  useEffect(() => {
    setIsPickerVisible(false);
    setDraftDate(null);
    setSession(null);
  }, [identity, formControl]);

  const selectedDate = useMemo(() => parseDateOnlyToDate(value), [value]);
  const usesModalPresentation = pickerPresentation === "modal";
  const formattedValue = selectedDate ? format(selectedDate, "EEE, MMM d, yyyy") : placeholder;
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

  const commitSelectedDate = (nextDate: Date, ticket: NativeInputSession) => {
    if (!ticket.isCurrent()) {
      return;
    }

    onChange(formatLocalDateOnly(nextDate));
  };

  const handleInlineDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (!session?.isCurrent()) return;
    if (event.type === "dismissed") {
      closePicker(session);
      return;
    }

    if (selected) {
      commitSelectedDate(selected, session);
    }

    closePicker(session);
  };

  const handleOpenPicker = () => {
    if (!usable()) {
      return;
    }

    const ticket = handoff.begin();
    if (!ticket) return;
    sessionRef.current = ticket;
    setSession(ticket);
    const initialDate = selectedDate ?? new Date();

    if (usesModalPresentation && Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initialDate,
        mode: "date",
        ...omitUndefined({ minimumDate, maximumDate }),
        onChange: (event, nextDate) => {
          if (!ticket.isCurrent()) return;
          if (event.type !== "dismissed" && nextDate) {
            commitSelectedDate(nextDate, ticket);
          }
          closePicker(ticket);
        },
      });
      return;
    }

    setDraftDate(initialDate);

    setIsPickerVisible(true);
  };

  return (
    <View className="gap-2">
      <Label {...omitUndefined({ nativeID: id })}>
        <Text className="text-sm font-medium text-foreground">
          {label}
          {required ? <Text className="text-destructive"> *</Text> : null}
        </Text>
      </Label>
      <View className="flex-row items-center gap-2">
        <Pressable
          ref={trigger}
          focusable
          onBlur={onBlur}
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
              if (usable()) {
                onChange(undefined);
                onBlur?.();
              }
            }}
          >
            <Text className="text-muted-foreground">Clear</Text>
          </Button>
        ) : null}
      </View>
      {isPickerVisible && handoff.presented && !usesModalPresentation ? (
        <DateTimePicker
          display="default"
          {...omitUndefined({ maximumDate, minimumDate })}
          mode="date"
          onChange={handleInlineDateChange}
          value={draftDate ?? selectedDate ?? new Date()}
        />
      ) : null}
      {usesModalPresentation && Platform.OS !== "android" && session ? (
        <Modal
          animationType="fade"
          onRequestClose={() => closePicker(session)}
          onDismiss={() => {
            session.restoreFocus();
            setSession((current) => (current === session && !session.isCurrent() ? null : current));
          }}
          transparent
          visible={isPickerVisible && handoff.presented}
        >
          <View className="flex-1 items-center justify-center bg-black/40 px-5">
            <View className="w-full max-w-md gap-4 rounded-2xl bg-background p-4">
              <DateTimePicker
                display="spinner"
                {...omitUndefined({ maximumDate, minimumDate })}
                mode="date"
                onChange={(_event, nextDate) => {
                  if (session.isCurrent() && nextDate) {
                    setDraftDate(nextDate);
                  }
                }}
                value={draftDate ?? selectedDate ?? new Date()}
              />
              <View className="flex-row justify-end gap-2">
                <Button variant="outline" onPress={() => closePicker(session)}>
                  <Text>Cancel</Text>
                </Button>
                <Button
                  disabled={disabled}
                  onPress={() => {
                    if (!session.isCurrent()) {
                      return;
                    }

                    if (draftDate) {
                      commitSelectedDate(draftDate, session);
                    }
                    closePicker(session);
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
