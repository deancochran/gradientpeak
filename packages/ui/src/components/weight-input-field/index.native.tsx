import { View } from "react-native";
import { BoundedNumberInput } from "../bounded-number-input/index.native";
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
    placeholder,
    required = false,
    resetKey,
    unit,
  } = props;
  const input = useWeightInput(props);
  const bounds = input.bounds;

  return (
    <View className="gap-3">
      <View>
        <View>
          <BoundedNumberInput
            testId={props.testId ?? props.testID}
            ref={ref}
            disabled={disabled}
            onBlur={onBlur}
            onInvalidChange={input.reportInvalid}
            formControl={formControl}
            fieldName={fieldName}
            adjustmentStep={0.01}
            decimals={2}
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
        </View>
      </View>
    </View>
  );
}

export { WeightInputField };
