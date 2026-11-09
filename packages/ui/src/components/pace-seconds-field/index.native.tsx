import { View } from "react-native";
import { Button } from "../button/index.native";
import { PaceInput } from "../pace-input/index.native";
import { Text } from "../text/index.native";
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
    <View className="flex-row items-end gap-2">
      {showAdjustmentButtons ? (
        <Button
          disabled={props.disabled}
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
          formControl={props.formControl}
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
      </View>
      {showAdjustmentButtons ? (
        <Button
          disabled={props.disabled}
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
