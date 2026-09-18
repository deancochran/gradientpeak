import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { View } from "react-native";
import { Button } from "../button/index.native";
import { Input } from "../input/index.native";
import { NativePicker } from "../native-picker/index.native";
import { Text } from "../text/index.native";
import {
  type DurationSegments,
  parseDurationSegments,
  type SegmentedDurationValueProps,
  splitDurationSeconds,
} from "./shared";

export {
  type DurationSegments,
  formatDurationSeconds,
  parseDurationSegments,
  splitDurationSeconds,
} from "./shared";

export interface SegmentedDurationFieldProps extends SegmentedDurationValueProps {
  ref?: Ref<{ focus: () => void }>;
  presentation?: "exact" | "native";
  active?: boolean;
  isCurrent?: () => boolean;
}

/** Exact integer seconds. Hide rather than unmount to retain incomplete segments. */
export function SegmentedDurationField({
  ref,
  valueSeconds,
  onChangeSeconds,
  onInvalidChange,
  segments,
  onSegmentsChange,
  label = "Duration",
  id,
  disabled = false,
  presentation = "exact",
  active = true,
  isCurrent,
}: SegmentedDurationFieldProps) {
  const [exact, setExact] = useState(presentation === "exact");
  const lastEmitted = useRef(valueSeconds);
  const [local, setDraft] = useState(() => splitDurationSeconds(valueSeconds));
  const draft =
    segments ?? (valueSeconds !== lastEmitted.current ? splitDurationSeconds(valueSeconds) : local);
  const [showHours, setShowHours] = useState(valueSeconds >= 3600);
  const lastEdited = useRef<keyof DurationSegments>("minutes");
  const inputs = useRef(new Map<string, React.ComponentRef<typeof Input>>());
  const invalid = parseDurationSegments(draft) === null;
  const reportedInvalid = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (reportedInvalid.current === invalid) return;
    reportedInvalid.current = invalid;
    onInvalidChange(invalid);
  }, [invalid, onInvalidChange]);
  useEffect(() => {
    if (valueSeconds !== lastEmitted.current) {
      setDraft(splitDurationSeconds(valueSeconds));
      setShowHours(valueSeconds >= 3600);
      lastEmitted.current = valueSeconds;
    }
  }, [valueSeconds]);
  useImperativeHandle(ref, () => ({
    focus: () => {
      if (!exact && !invalid) return;
      setExact(true);
      const key = (Object.keys(draft) as (keyof DurationSegments)[]).find(
        (part) => !/^\d+$/.test(draft[part]) || (part !== "hours" && Number(draft[part]) > 59),
      );
      inputs.current.get(key ?? (invalid ? lastEdited.current : "minutes"))?.focus?.();
    },
  }));
  return (
    <View className="gap-2">
      {presentation === "native" ? (
        <Button
          variant="ghost"
          disabled={disabled}
          accessibilityLabel={exact ? "Use native duration picker" : "Enter exact duration"}
          onPress={() => {
            if (exact && invalid) return;
            setExact(!exact);
          }}
        >
          <Text>{exact ? "Choose duration" : "Type duration"}</Text>
        </Button>
      ) : null}
      {!exact && !invalid ? (
        <View className="flex-row gap-2">
          {(["hours", "minutes", "seconds"] as const)
            .filter((part) => part !== "hours" || showHours || draft.hours !== "0")
            .map((part) => {
              const hours = Number(draft.hours);
              const minutes = Number(draft.minutes);
              const seconds = Number(draft.seconds);
              const remainder =
                part === "hours"
                  ? minutes + seconds
                  : part === "minutes"
                    ? hours + seconds
                    : hours + minutes;
              const min = remainder === 0 ? 1 : 0;
              const max = part === "hours" ? (minutes || seconds ? 23 : 24) : hours === 24 ? 0 : 59;
              return (
                <View key={part} className="flex-1">
                  <Text>
                    {part === "hours" ? "Hours" : part === "minutes" ? "Minutes" : "Seconds"}
                  </Text>
                  <NativePicker
                    label={`${label} ${part}`}
                    value={Number(draft[part])}
                    options={Array.from({ length: max - min + 1 }, (_, index) => ({
                      value: min + index,
                      label: String(min + index),
                    }))}
                    disabled={disabled || !active}
                    {...(isCurrent ? { isCurrent } : {})}
                    onChange={(value) => {
                      const next = {
                        ...splitDurationSeconds(lastEmitted.current),
                        [part]: String(value),
                      };
                      const total = parseDurationSegments(next);
                      if (total === null) return;
                      setDraft(next);
                      onSegmentsChange?.(next);
                      lastEmitted.current = total;
                      onChangeSeconds(total);
                    }}
                  />
                </View>
              );
            })}
        </View>
      ) : null}
      <View
        style={!exact && !invalid ? { display: "none" } : undefined}
        accessibilityElementsHidden={!exact && !invalid}
        importantForAccessibility={!exact && !invalid ? "no-hide-descendants" : "auto"}
        className="flex-row items-end gap-2"
      >
        {(["hours", "minutes", "seconds"] as const)
          .filter((part) => part !== "hours" || showHours || draft.hours !== "0")
          .map((part) => (
            <View key={part} className="flex-1 gap-1">
              <Text>{part === "hours" ? "Hours" : part === "minutes" ? "Minutes" : "Seconds"}</Text>
              <Input
                ref={(handle) => {
                  if (handle) inputs.current.set(part, handle);
                  else inputs.current.delete(part);
                }}
                accessibilityLabel={`${label} ${part}`}
                {...(id === undefined ? {} : { nativeID: `${id}-${part}` })}
                editable={!disabled}
                accessibilityHint="Whole numbers; minutes and seconds from 0 to 59. Total 1 second to 24 hours."
                className="min-h-12"
                keyboardType="number-pad"
                value={draft[part]}
                onChangeText={(text) => {
                  if (!active || disabled || (isCurrent && !isCurrent())) return;
                  lastEdited.current = part;
                  const next = { ...draft, [part]: text };
                  setDraft(next);
                  onSegmentsChange?.(next);
                  const seconds = parseDurationSegments(next);
                  if (seconds !== null) {
                    lastEmitted.current = seconds;
                    onChangeSeconds(seconds);
                  }
                }}
              />
            </View>
          ))}
      </View>
      {!showHours && draft.hours === "0" ? (
        <Button
          disabled={disabled}
          variant="ghost"
          className="min-h-12 self-start"
          onPress={() => setShowHours(true)}
        >
          <Text>Add hours</Text>
        </Button>
      ) : null}
      {invalid ? (
        <Text accessibilityRole="alert" className="text-destructive">
          Enter whole time segments totaling 1 second to 24 hours.
        </Text>
      ) : null}
    </View>
  );
}
