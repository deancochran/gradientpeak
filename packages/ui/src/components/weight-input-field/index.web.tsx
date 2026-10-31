import { BoundedNumberInput } from "../bounded-number-input/index.web";
import { Button } from "../button/index.web";
import type { WeightInputFieldProps } from "./shared";
import { useWeightInput } from "./use-weight-input";

function WeightInputField(props: WeightInputFieldProps) {
  const {
    ref,
    disabled,
    onBlur,
    formControl,
    fieldName,
    error,
    helperText,
    id,
    label,
    onUnitChange,
    placeholder,
    required = false,
    resetKey,
    unit,
  } = props;
  const input = useWeightInput(props);
  const bounds = input.bounds;

  return (
    <div className="grid gap-3">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <BoundedNumberInput
            testId={props.testId ?? props.testID}
            ref={ref}
            disabled={disabled}
            onBlur={onBlur}
            onInvalidChange={input.reportInvalid}
            formControl={formControl}
            fieldName={fieldName}
            adjustmentStep={0.1}
            decimals={1}
            error={error}
            helperText={helperText}
            id={id}
            label={label}
            max={bounds.max}
            min={bounds.min}
            onChange={input.change}
            onInputResult={input.result}
            placeholder={placeholder}
            required={required}
            showAdjustmentButtons
            resetKey={`${resetKey ?? ""}:${unit}`}
            unitLabel={unit}
            value={input.text}
          />
        </div>
        {onUnitChange ? (
          <div className="flex gap-2 pb-0.5 sm:flex-row">
            {(["kg", "lbs"] as const).map((nextUnit) => (
              <Button
                key={`${id}-${nextUnit}`}
                size="sm"
                type="button"
                variant={unit === nextUnit ? "default" : "outline"}
                disabled={disabled || input.invalid}
                onClick={() => input.changeUnit(nextUnit)}
              >
                {nextUnit.toUpperCase()}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export { WeightInputField };
