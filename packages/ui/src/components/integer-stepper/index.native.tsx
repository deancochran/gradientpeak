import { clampInteger } from "@repo/core/utils/fitness-inputs";
import { type Ref, useImperativeHandle, useRef } from "react";
import { View } from "react-native";
import { Button } from "../button/index.native";
import { NativeQuantityInput } from "../native-quantity-input/index.native";
import { Text } from "../text/index.native";
import type { IntegerStepperProps } from "./shared";

interface NativeIntegerStepperProps extends IntegerStepperProps {
  presentation?: "default" | "tactile" | "compact";
}

/** Count changes are a finite native dial; +/- remains a secondary quick adjustment. */
function IntegerStepper(props: NativeIntegerStepperProps) {
  const {
    disabled = false,
    label = "Value",
    max = 20,
    min = 0,
    presentation = "default",
    step = 1,
  } = props;
  const dial = useRef<{ focus: () => void }>(null);
  useImperativeHandle(props.ref as Ref<{ focus: () => void }>, () => ({
    focus: () => dial.current?.focus(),
  }));
  const current =
    typeof props.value === "number" && Number.isSafeInteger(props.value) ? props.value : undefined;
  const increment = Number.isSafeInteger(step) && step > 0 ? step : 1;
  const decrementDisabled = disabled || current === undefined || current <= min;
  const incrementDisabled = disabled || current === undefined || current >= max;
  const nudge = (direction: -1 | 1) => {
    if (
      current === undefined ||
      disabled ||
      (direction < 0 && current <= min) ||
      (direction > 0 && current >= max)
    )
      return;
    const next = clampInteger(current + direction * increment, min, max);
    props.onDraftChange?.(String(next));
    props.onChange(next);
  };
  return (
    <View className={presentation === "compact" ? "flex-row items-center gap-2" : "gap-2"}>
      <Button
        accessibilityLabel={`Decrease ${label}`}
        disabled={decrementDisabled}
        onPress={() => nudge(-1)}
        size="sm"
        variant="outline"
      >
        <Text>-</Text>
      </Button>
      <View className="flex-1">
        <NativeQuantityInput
          ref={dial}
          label={label}
          value={props.exactDraft ?? (current === undefined ? "" : String(current))}
          onChange={props.onDraftChange ?? (() => undefined)}
          onNumberChange={(value) => {
            if (value !== undefined) props.onChange(value);
          }}
          onInputResult={props.onInputResult}
          onInvalidChange={props.onInvalidChange}
          onBlur={props.onBlur}
          formControl={props.formControl}
          fieldName={props.fieldName}
          resetKey={props.resetKey}
          required={props.required}
          disabled={disabled}
          min={min}
          max={max}
          decimals={0}
          error={props.error}
          helperText={props.helperText}
          accessibilityHint={props.accessibilityHint}
          testId={props.testId}
        />
      </View>
      <Button
        accessibilityLabel={`Increase ${label}`}
        disabled={incrementDisabled}
        onPress={() => nudge(1)}
        size="sm"
        variant="outline"
      >
        <Text>+</Text>
      </Button>
    </View>
  );
}

export { IntegerStepper };
