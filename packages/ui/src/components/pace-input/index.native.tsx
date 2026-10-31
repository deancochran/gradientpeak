import {
  durationSegmentsApiText,
  paceTextSegments,
  parseDurationSegments,
  resolvePaceSegmentLayout,
} from "@repo/core/utils/fitness-inputs";
import { View } from "react-native";
import { SegmentedDurationField } from "../segmented-duration-field/index.native";
import { Text } from "../text/index.native";
import type { PaceInputProps } from "./shared";

export function PaceInput(props: PaceInputProps) {
  const policy = {
    layout: resolvePaceSegmentLayout(props.layout),
    minSeconds: 1,
    allowOmittedSegments: true,
  };
  const segments = paceTextSegments(props.value, policy.layout);
  return (
    <View className="gap-2">
      {props.triggerVariant !== "row" ? (
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-medium text-foreground">
            {props.label}
            {props.required ? " *" : ""}
          </Text>
          <Text>{props.unitLabel ?? "/km"}</Text>
        </View>
      ) : null}
      <SegmentedDurationField
        presentation={props.presentation ?? "native-overlay"}
        testId={props.testId ?? props.id}
        unitLabel={props.unitLabel ?? "/km"}
        {...policy}
        ref={props.ref}
        id={props.id ?? props.testId}
        label={props.label}
        required={props.required ?? false}
        disabled={props.disabled}
        formControl={props.formControl}
        fieldName={props.fieldName}
        resetKey={props.resetKey}
        error={props.error}
        accessibilityHint={props.accessibilityHint ?? props.helperText}
        triggerVariant={props.triggerVariant}
        valueSeconds={parseDurationSegments(segments, policy)}
        segments={segments}
        onSegmentsChange={(next) => props.onChange(durationSegmentsApiText(next, policy, "ms"))}
        onChangeSeconds={(value) => props.onPaceSecondsChange?.(value)}
        onEmpty={() => props.onPaceSecondsChange?.(undefined)}
        onInvalidChange={() => undefined}
        onBlur={props.onBlur}
      />
      {props.helperText ? (
        <Text className="text-xs text-muted-foreground">{props.helperText}</Text>
      ) : null}
    </View>
  );
}
