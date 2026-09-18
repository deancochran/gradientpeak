import { Button } from "../button/index.web";
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
  showAdjustmentButtons = true,
  testId,
  unitLabel,
  valueSeconds,
}: PaceSecondsFieldProps) {
  const draft = usePaceSecondsField({ formControl, onBlur, onChangeSeconds, valueSeconds });

  return (
    <div className="flex items-end gap-2">
      {showAdjustmentButtons ? (
        <Button
          aria-label={`Decrease ${label}`}
          onClick={() => draft.adjust(-1)}
          size="sm"
          type="button"
          variant="outline"
        >
          -5s
        </Button>
      ) : null}
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
      {showAdjustmentButtons ? (
        <Button
          aria-label={`Increase ${label}`}
          onClick={() => draft.adjust(1)}
          size="sm"
          type="button"
          variant="outline"
        >
          +5s
        </Button>
      ) : null}
    </div>
  );
}

export { PaceSecondsField };
