import { PaceInput } from "@/components/training-plan/create/inputs/PaceInput";
import { formatSecondsToMmSs } from "@/lib/training-plan-form/input-parsers";
import React, { useEffect, useState } from "react";

interface PaceSecondsFieldProps {
  id: string;
  label: string;
  valueSeconds: number | null | undefined;
  onChangeSeconds: (value: number | null) => void;
  helperText?: string;
  placeholder?: string;
  unitLabel?: string;
  required?: boolean;
}

export function PaceSecondsField({
  id,
  label,
  valueSeconds,
  onChangeSeconds,
  helperText,
  placeholder,
  unitLabel,
  required = false,
}: PaceSecondsFieldProps) {
  const [draftValue, setDraftValue] = useState(
    valueSeconds == null ? "" : formatSecondsToMmSs(valueSeconds),
  );

  useEffect(() => {
    setDraftValue(
      valueSeconds == null ? "" : formatSecondsToMmSs(valueSeconds),
    );
  }, [valueSeconds]);

  return (
    <PaceInput
      id={id}
      label={label}
      value={draftValue}
      onChange={setDraftValue}
      onPaceSecondsChange={(nextValue) => onChangeSeconds(nextValue ?? null)}
      helperText={helperText}
      placeholder={placeholder}
      unitLabel={unitLabel}
      required={required}
    />
  );
}
