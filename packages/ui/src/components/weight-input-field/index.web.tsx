import { useEffect, useMemo, useState } from "react";
import {
  convertWeightToKg,
  formatWeightForDisplay,
  getWeightBounds,
  roundToDecimals,
} from "../../lib/fitness-inputs";
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
  unit,
  valueKg,
}: WeightInputFieldProps) {
  const [displayValue, setDisplayValue] = useState(formatWeightForDisplay(valueKg, unit));

  useEffect(() => {
    setDisplayValue(formatWeightForDisplay(valueKg, unit));
  }, [unit, valueKg]);

  const bounds = useMemo(() => getWeightBounds(unit), [unit]);

  return (
    <div className="grid gap-3">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <BoundedNumberInput
            decimals={1}
            error={error}
            helperText={helperText}
            id={id}
            label={label}
            max={bounds.max}
            min={bounds.min}
            onChange={setDisplayValue}
            onNumberChange={(nextValue) => {
              if (nextValue === undefined) {
                onChangeKg(null);
                return;
              }
              onChangeKg(roundToDecimals(convertWeightToKg(nextValue, unit), 1));
            }}
            placeholder={placeholder}
            required={required}
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
