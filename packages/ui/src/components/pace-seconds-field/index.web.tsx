import { useEffect, useState } from "react";
import { formatSecondsToMmSs } from "../../lib/fitness-inputs";
import { PaceInput } from "../pace-input/index.web";
import type { PaceSecondsFieldProps } from "./shared";

function PaceSecondsField({
  helperText,
  id,
  label,
  onChangeSeconds,
  placeholder,
  required = false,
  unitLabel,
  valueSeconds,
}: PaceSecondsFieldProps) {
  const [draftValue, setDraftValue] = useState(
    valueSeconds == null ? "" : formatSecondsToMmSs(valueSeconds),
  );

  useEffect(() => {
    setDraftValue(valueSeconds == null ? "" : formatSecondsToMmSs(valueSeconds));
  }, [valueSeconds]);

  return (
    <PaceInput
      helperText={helperText}
      id={id}
      label={label}
      onChange={setDraftValue}
      onPaceSecondsChange={(nextValue) => onChangeSeconds(nextValue ?? null)}
      placeholder={placeholder}
      required={required}
      unitLabel={unitLabel}
      value={draftValue}
    />
  );
}

export { PaceSecondsField };
