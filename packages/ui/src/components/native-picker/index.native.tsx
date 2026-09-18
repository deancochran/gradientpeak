import { Picker } from "@react-native-picker/picker";
import { type Ref, useEffect, useImperativeHandle, useRef } from "react";

export interface NativePickerProps<T extends string | number> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  isCurrent?: () => boolean;
  testID?: string;
  ref?: Ref<{ focus: () => void }>;
}

/** UIPickerView on iOS; platform Spinner dialog on Android. No selection styling. */
export function NativePicker<T extends string | number>({
  ref,
  label,
  value,
  options,
  onChange,
  disabled = false,
  isCurrent,
  testID,
}: NativePickerProps<T>) {
  const picker = useRef<Picker<T>>(null);
  const mounted = useRef(false);
  const availability = useRef({ disabled, generation: 0 });
  if (availability.current.disabled !== disabled) {
    availability.current = { disabled, generation: availability.current.generation + 1 };
  }
  // Re-enabling must not authorize a selection queued before the disabled period.
  const generation = availability.current.generation;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useImperativeHandle(ref, () => ({ focus: () => picker.current?.focus?.() }));
  return (
    <Picker
      ref={picker}
      accessibilityLabel={label}
      testID={testID ?? `${label}-picker`}
      selectedValue={value}
      enabled={!disabled}
      mode="dialog"
      prompt={label}
      style={{ width: "100%" }}
      onValueChange={(next) => {
        if (
          !mounted.current ||
          disabled ||
          availability.current.disabled ||
          availability.current.generation !== generation ||
          (isCurrent && !isCurrent())
        )
          return;
        if (next !== value && options.some((option) => option.value === next)) onChange(next);
      }}
    >
      {!options.some((option) => option.value === value) ? (
        <Picker.Item label={`${value || "Choose"} (needs selection)`} value={value} />
      ) : null}
      {options.map((option) => (
        <Picker.Item key={option.value} label={option.label} value={option.value} />
      ))}
    </Picker>
  );
}
