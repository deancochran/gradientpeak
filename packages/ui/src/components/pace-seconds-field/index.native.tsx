import { View } from "react-native";
import { Button } from "../button/index.native";
import { PaceInput } from "../pace-input/index.native";
import { Text } from "../text/index.native";
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
    <View className="flex-row items-end gap-2">
      {showAdjustmentButtons ? (
        <Button
          accessibilityLabel={`Decrease ${label}`}
          onPress={() => draft.adjust(-1)}
          size="sm"
          variant="outline"
        >
          <Text>-5s</Text>
        </Button>
      ) : null}
      <View className="flex-1">
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
      </View>
      {showAdjustmentButtons ? (
        <Button
          accessibilityLabel={`Increase ${label}`}
          onPress={() => draft.adjust(1)}
          size="sm"
          variant="outline"
        >
          <Text>+5s</Text>
        </Button>
      ) : null}
    </View>
  );
}

export { PaceSecondsField };
