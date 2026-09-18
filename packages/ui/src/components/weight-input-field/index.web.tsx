import {
  convertWeightToKg,
  formatWeightForDisplay,
  getWeightBounds,
  parseBoundedNumber,
  roundToDecimals,
} from "@repo/core/utils/fitness-inputs";
import { useMemo } from "react";
import { useInputDraft } from "../../hooks/use-input-draft";
import { BoundedNumberInput } from "../bounded-number-input/index.web";
import { Button } from "../button/index.web";
import type { WeightInputFieldProps } from "./shared";

function WeightInputField({
  error,
  helperText,
  id,
  label,
  onChangeKg,
  onUnitChange,
  placeholder,
  required = false,
  resetKey,
  unit,
  valueKg,
}: WeightInputFieldProps) {
  const [displayValue, setDisplayValue] = useInputDraft(
    formatWeightForDisplay(valueKg, unit),
    `${resetKey ?? ""}:${unit}`,
  );

  const bounds = useMemo(() => getWeightBounds(unit), [unit]);

  return (
    <div className="grid gap-3">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <BoundedNumberInput
            adjustmentStep={0.1}
            decimals={1}
            error={error}
            helperText={helperText}
            id={id}
            label={label}
            max={bounds.max}
            min={bounds.min}
            onChange={(nextValue) => {
              const parsed = parseBoundedNumber(nextValue, { ...bounds, decimals: 1 });
              const nextKg =
                parsed === undefined ? null : roundToDecimals(convertWeightToKg(parsed, unit), 1);
              setDisplayValue(nextValue, [formatWeightForDisplay(nextKg, unit)]);
            }}
            onNumberChange={(nextValue) => {
              if (nextValue === undefined) {
                onChangeKg(null);
                return;
              }
              onChangeKg(roundToDecimals(convertWeightToKg(nextValue, unit), 1));
            }}
            placeholder={placeholder}
            required={required}
            showAdjustmentButtons
            resetKey={`${resetKey ?? ""}:${unit}`}
            unitLabel={unit}
            value={displayValue}
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
                onClick={() => onUnitChange(nextUnit)}
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
