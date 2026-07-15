import { PaceInput } from "../pace-input/index.web";
import type { PaceSecondsFieldProps } from "./shared";
import { usePaceSecondsField } from "./use-pace-seconds-field";

function PaceSecondsField({
  error,
  formControl,
  helperText,
  id,
  label,
  onBlur,
  onChangeSeconds,
  placeholder,
  required = false,
  testId,
  unitLabel,
  valueSeconds,
}: PaceSecondsFieldProps) {
  const draft = usePaceSecondsField({ formControl, onBlur, onChangeSeconds, valueSeconds });

  return (
    <PaceInput
      error={error}
      helperText={helperText}
      id={id}
      label={label}
      onBlur={draft.onBlur}
      onChange={draft.onChange}
      placeholder={placeholder}
      required={required}
      testId={testId}
      unitLabel={unitLabel}
      value={draft.draftValue}
    />
  );
}

export { PaceSecondsField };
