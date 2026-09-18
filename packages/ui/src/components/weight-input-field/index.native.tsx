import {
  convertWeightToKg,
  formatWeightForDisplay,
  getWeightBounds,
  parseBoundedNumber,
  roundToDecimals,
} from "@repo/core/utils/fitness-inputs";
import { useMemo } from "react";
import { View } from "react-native";
import { useInputDraft } from "../../hooks/use-input-draft";
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
    <View className="gap-3">
      <View className="flex-row items-end gap-3">
        <View className="flex-1">
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
