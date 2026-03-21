import React, { useEffect, useMemo, useState } from "react";
import {
  convertWeightToKg,
  formatWeightForDisplay,
  getWeightBounds,
  roundToDecimals,
} from "../../lib/fitness-inputs";
import { View } from "../../lib/react-native";
import { BoundedNumberInput } from "../bounded-number-input/index.native";
import { Button } from "../button/index.native";
import { Text } from "../text/index.native";
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
    <View className="gap-3">
      <View className="flex-row items-end gap-3">
        <View className="flex-1">
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
        </View>
        {onUnitChange ? (
          <View className="flex-row gap-2 pb-0.5">
            {(["kg", "lbs"] as const).map((nextUnit) => (
              <Button
                key={`${id}-${nextUnit}`}
                size="sm"
                variant={unit === nextUnit ? "default" : "outline"}
                onPress={() => onUnitChange(nextUnit)}
              >
                <Text>{nextUnit.toUpperCase()}</Text>
              </Button>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export { WeightInputField };
