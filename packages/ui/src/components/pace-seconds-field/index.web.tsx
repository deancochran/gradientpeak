import { Button } from "../button/index.web";
import { PaceInput } from "../pace-input/index.web";
import type { PaceSecondsFieldProps } from "./shared";
import { usePaceSecondsField } from "./use-pace-seconds-field";

function PaceSecondsField(props: PaceSecondsFieldProps) {
  const {
    error,
    helperText,
    id,
    label,
    placeholder,
    required = false,
    showAdjustmentButtons = true,
    testId,
    unitLabel,
  } = props;
  const draft = usePaceSecondsField(props);

  return (
    <div className="flex items-end gap-2">
      {showAdjustmentButtons ? (
        <Button
          disabled={props.disabled}
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
        ref={props.ref}
        disabled={props.disabled}
        resetKey={props.resetKey}
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
          disabled={props.disabled}
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
