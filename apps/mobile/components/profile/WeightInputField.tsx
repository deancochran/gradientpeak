import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { BoundedNumberInput } from "@/components/training-plan/create/inputs/BoundedNumberInput";
import {
  convertWeightToKg,
  formatWeightForDisplay,
  getWeightBounds,
  roundToDecimals,
  type WeightUnit,
} from "@/lib/profile/metricUnits";
import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

interface WeightInputFieldProps {
  id: string;
  label: string;
  valueKg: number | null | undefined;
  onChangeKg: (valueKg: number | null) => void;
  unit: WeightUnit;
  onUnitChange?: (unit: WeightUnit) => void;
  helperText?: string;
  error?: string;
  placeholder?: string;
  required?: boolean;
}

export function WeightInputField({
  id,
  label,
  valueKg,
  onChangeKg,
  unit,
  onUnitChange,
  helperText,
  error,
  placeholder,
  required = false,
}: WeightInputFieldProps) {
  const [displayValue, setDisplayValue] = useState(
    formatWeightForDisplay(valueKg, unit),
  );

  useEffect(() => {
    setDisplayValue(formatWeightForDisplay(valueKg, unit));
  }, [unit, valueKg]);

  const bounds = useMemo(() => getWeightBounds(unit), [unit]);

  return (
    <View className="gap-3">
      <View className="flex-row items-end gap-3">
        <View className="flex-1">
          <BoundedNumberInput
            id={id}
            label={label}
            value={displayValue}
            onChange={setDisplayValue}
            onNumberChange={(nextValue) => {
              if (nextValue === undefined) {
                onChangeKg(null);
                return;
              }

              onChangeKg(
                roundToDecimals(convertWeightToKg(nextValue, unit), 1),
              );
            }}
            min={bounds.min}
            max={bounds.max}
            decimals={1}
            unitLabel={unit}
            helperText={helperText}
            error={error}
            placeholder={placeholder}
            required={required}
            accessibilityHint={`Enter weight in ${unit}`}
          />
        </View>
        {onUnitChange ? (
          <View className="flex-row gap-2 pb-0.5">
            {(["kg", "lbs"] as const).map((nextUnit) => (
              <Button
                key={`${id}-${nextUnit}`}
                variant={unit === nextUnit ? "default" : "outline"}
                size="sm"
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
