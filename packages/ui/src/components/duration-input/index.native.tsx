import {
  durationSegmentsApiText,
  durationTextSegments,
  parseDurationSegments,
} from "@repo/core/utils/fitness-inputs";
import { View } from "react-native";
import { SegmentedDurationField } from "../segmented-duration-field/index.native";
import { Text } from "../text/index.native";
import type { DurationInputProps } from "./shared";

export function DurationInput(props: DurationInputProps) {
  const policy = {
    layout: props.layout ?? "hms",
    minSeconds: props.minSeconds ?? 1,
    maxSeconds: props.maxSeconds,
    granularitySeconds: props.granularitySeconds,
    allowOmittedSegments: true,
  };
  const segments = durationTextSegments(props.value, policy.layout);
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-foreground">
        {props.label}
        {props.required ? " *" : ""}
      </Text>
      <SegmentedDurationField
        presentation="native-overlay"
        testId={props.testId ?? props.id}
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
        valueSeconds={parseDurationSegments(segments, policy)}
        segments={segments}
        onSegmentsChange={(next) => props.onChange(durationSegmentsApiText(next, policy, "hms"))}
        onChangeSeconds={(value) => props.onDurationSecondsChange?.(value)}
        onEmpty={() => props.onDurationSecondsChange?.(undefined)}
        onInvalidChange={(invalid) => props.onInvalidChange?.(invalid)}
        onBlur={props.onBlur}
      />
      {props.helperText ? (
        <Text className="text-xs text-muted-foreground">{props.helperText}</Text>
      ) : null}
    </View>
  );
}
