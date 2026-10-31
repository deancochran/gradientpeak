import {
  durationSegmentsText,
  durationWheelValues,
  splitDurationSeconds,
} from "@repo/core/utils/fitness-inputs";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  useColorScheme,
  View,
} from "react-native";
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import { useFormDraftResetKey } from "../../hooks/pending-form-drafts";
import {
  type NativeInputSession,
  useNativeInputHandoff,
} from "../../hooks/use-native-input-handoff";
import { getResolvedNativeTheme } from "../../lib/native-theme";
import { Button } from "../button/index.native";
import { NativePicker } from "../native-picker/index.native";
import { Text } from "../text/index.native";
import type { DurationSegments, SegmentedDurationValueProps } from "./shared";
import { useDurationSegments } from "./use-duration-segments";

export {
  type DurationSegments,
  formatDurationSeconds,
  parseDurationSegments,
  splitDurationSeconds,
} from "./shared";

export interface SegmentedDurationFieldProps extends SegmentedDurationValueProps {
  ref?: Ref<{ focus: () => void }> | undefined;
  presentation?: "exact" | "native" | "native-overlay" | undefined;
  testId?: string | undefined;
  unitLabel?: string | undefined;
}

export function SegmentedDurationField(props: SegmentedDurationFieldProps) {
  const label = props.label ?? "Duration";
  const rowTrigger = props.triggerVariant === "row";
  const theme = getResolvedNativeTheme(useColorScheme());
  const formReset = useFormDraftResetKey(props.formControl);
  const overlay = props.presentation === "native-overlay";
  const [entry, setEntry] = useState<{ session: NativeInputSession; visible: boolean } | null>(
    null,
  );
  const [interacted, setInteracted] = useState(false);
  const originalDraft = useRef<DurationSegments | null>(null);
  const trigger = useRef<View>(null);
  const focusTrigger = () => {
    trigger.current?.focus?.();
    const node = findNodeHandle(trigger.current);
    if (node != null) AccessibilityInfo.setAccessibilityFocus(node);
  };
  const identity = JSON.stringify([
    props.resetKey,
    formReset,
    props.fieldName,
    props.layout,
    props.presentation,
  ]);
  const disabled = Boolean(props.disabled || props.active === false);
  const handoff = useNativeInputHandoff({
    disabled,
    identity,
    owner: props.formControl,
    isCurrent: props.isCurrent,
    focus: focusTrigger,
  });
  const open = () => {
    const session = handoff.begin();
    if (!session) return;
    originalDraft.current = input.draft;
    setInteracted(false);
    setEntry({ session, visible: true });
  };
  const focus = () => {
    open();
  };
  const input = useDurationSegments(props, focus);
  // Native duration entry always uses platform pickers; `exact` remains accepted for callers
  // but no longer introduces a keyboard/manual-entry mode.
  const native = true;
  const wheel = native;
  useImperativeHandle(props.ref, () => ({
    focus: () => {
      focus();
    },
  }));
  // biome-ignore lint/correctness/useExhaustiveDependencies: rebinding/reset ends the old presentation, not the form value.
  useEffect(() => {
    setEntry(null);
  }, [identity, disabled, props.formControl]);
  const dismiss = (session: NativeInputSession) => {
    session.restoreFocus();
    setEntry((current) => (current?.session === session && !current.visible ? null : current));
  };
  const close = (session: NativeInputSession) => {
    if (!session.isLatest()) return;
    session.close();
    setEntry((current) => (current?.session === session ? { session, visible: false } : current));
    props.onBlur?.();
    if (Platform.OS === "android") requestAnimationFrame(() => dismiss(session));
  };
  const cancel = (session: NativeInputSession) => {
    if (!session.isLatest()) return;
    if (originalDraft.current) input.replace(originalDraft.current);
    close(session);
  };
  const done = (session: NativeInputSession) => {
    if (!session.isLatest()) return;
    const acceptable =
      input.result.status === "valid" ||
      (!(props.required ?? true) && input.result.status === "empty");
    if (!acceptable) {
      setInteracted(true);
      return;
    }
    close(session);
  };
  const error =
    props.error ??
    (interacted && (input.precisionError ?? input.invalid)
      ? props.maxSeconds === 86400
        ? "Enter whole time segments totaling 1 second to 24 hours."
        : `Enter a valid ${label.toLowerCase()}. ${input.hint}`
      : undefined);
  // The compact row is a summary, not an editor: only a valid, precision-compatible
  // value is normalized for scanning. Other variants and every repair draft retain
  // durationSegmentsText's original representation.
  const triggerDisplay = () => {
    if (
      rowTrigger &&
      input.result.status === "valid" &&
      !input.precisionError &&
      input.keys.every((part) => /^\d+$/.test(input.draft[part]))
    )
      return input.keys
        .map((part, index) =>
          index === 0 ? String(Number(input.draft[part])) : input.draft[part].padStart(2, "0"),
        )
        .join(":");
    return durationSegmentsText(input.draft, props);
  };
  const triggerValue =
    input.result.status === "empty"
      ? "Not set"
      : `${triggerDisplay()}${rowTrigger && props.unitLabel ? ` ${props.unitLabel}` : ""}`;
  const allowed = (session?: NativeInputSession) =>
    input.isCurrent() && (!session || session.isCurrent()) && (props.isCurrent?.() ?? true);
  const wheelValue = (part: (typeof input.keys)[number]) => {
    const value = input.draft[part];
    if (value.trim() === "") return 0;
    return Number.isSafeInteger(Number(value)) ? Number(value) : value;
  };
  const changeWheel = (part: (typeof input.keys)[number], value: string | number) => {
    // An unset optional value remains unset while its wheel is displayed at the
    // neutral zero position. The first deliberate selection makes every
    // segment explicit so selecting one wheel can produce a valid duration.
    if (input.result.status === "empty")
      input.replace({ ...splitDurationSeconds(0, props.layout), [part]: String(value) });
    else input.change(part, String(value));
    setInteracted(true);
  };
  const controls = (session?: NativeInputSession) => {
    const overlayStyle = session ? { color: theme.foreground } : undefined;
    const pickerColors = session
      ? { foregroundColor: theme.foreground, backgroundColor: theme.card }
      : undefined;
    return (
      <View className="gap-3">
        {props.unitLabel ? <Text style={overlayStyle}>{props.unitLabel}</Text> : null}
        {wheel ? (
          <View className="flex-row gap-2">
            {input.keys.map((part) => (
              <View key={part} className="flex-1">
                <Text style={overlayStyle}>
                  {part === "hours" ? "Hours" : part === "minutes" ? "Minutes" : "Seconds"}
                </Text>
                <NativePicker
                  {...pickerColors}
                  label={`${label} ${part}`}
                  value={wheelValue(part)}
                  disabled={disabled}
                  mode="dropdown"
                  isCurrent={() => allowed(session)}
                  {...(props.id === undefined ? {} : { testID: `${props.id}-${part}` })}
                  options={durationWheelValues(part, input.draft, props).map((value) => ({
                    value,
                    label: String(value),
                  }))}
                  onChange={(value) => {
                    if (allowed(session)) changeWheel(part, value);
                  }}
                />
              </View>
            ))}
          </View>
        ) : null}
        {!(props.required ?? true) && input.result.status === "empty" ? (
          <Text style={overlayStyle}>Not set</Text>
        ) : null}
        {!(props.required ?? true) && input.result.status !== "empty" ? (
          <Button
            variant="ghost"
            disabled={disabled}
            accessibilityLabel={`Clear ${label}`}
            onPress={() => {
              if (allowed(session)) {
                input.clear();
                setInteracted(true);
              }
            }}
          >
            <Text style={overlayStyle}>Clear</Text>
          </Button>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" className="text-destructive" style={overlayStyle}>
            {error}
          </Text>
        ) : null}
      </View>
    );
  };
  if (!overlay) return controls();
  return (
    <View className="gap-2">
      <Pressable
        ref={trigger}
        focusable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, expanded: Boolean(entry?.visible && handoff.presented) }}
        accessibilityValue={{
          text: triggerValue,
        }}
        disabled={disabled}
        testID={props.testId ?? props.id}
        onPress={open}
        className={
          rowTrigger
            ? "min-h-12 flex-row items-center justify-between border-b border-border py-3"
            : "min-h-12 rounded-md border border-input p-3"
        }
      >
        {rowTrigger ? <Text className="text-sm font-medium">{label}</Text> : null}
        <Text {...(rowTrigger ? { className: "text-sm text-muted-foreground" } : {})}>
          {triggerValue}
        </Text>
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" className="text-destructive">
          {error}
        </Text>
      ) : null}
      {entry ? (
        <Modal
          transparent
          visible={entry.visible && handoff.presented}
          animationType="slide"
          onRequestClose={() => cancel(entry.session)}
          onDismiss={() => dismiss(entry.session)}
          onShow={() => {
            if (!entry.session.isCurrent()) return;
          }}
        >
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <View
              className="flex-1 justify-end bg-black/40"
              testID={`${props.testId ?? props.id ?? label}-duration-overlay`}
            >
              {entry.visible && handoff.presented ? (
                <SafeAreaView
                  edges={["bottom"]}
                  testID={`${props.testId ?? props.id ?? label}-duration-surface`}
                  className="overflow-hidden rounded-t-2xl"
                  style={{
                    backgroundColor: theme.card,
                    flexShrink: 1,
                    maxHeight: "80%",
                    minHeight: 0,
                  }}
                >
                  <View className="flex-row items-center justify-between border-b border-border p-4">
                    <Button
                      variant="ghost"
                      accessibilityLabel={`Cancel ${label}`}
                      onPress={() => cancel(entry.session)}
                    >
                      <Text style={{ color: theme.foreground }}>Cancel</Text>
                    </Button>
                    <Text
                      accessibilityRole="header"
                      className="text-xl font-semibold"
                      style={{ color: theme.foreground }}
                    >
                      {label}
                    </Text>
                    <Button
                      variant="ghost"
                      accessibilityLabel={`Done ${label}`}
                      onPress={() => done(entry.session)}
                    >
                      <Text style={{ color: theme.foreground }}>Done</Text>
                    </Button>
                  </View>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    style={{ flexShrink: 1, minHeight: 0 }}
                    contentContainerStyle={{ padding: 16 }}
                  >
                    {controls(entry.session)}
                  </ScrollView>
                </SafeAreaView>
              ) : null}
            </View>
          </SafeAreaProvider>
        </Modal>
      ) : null}
    </View>
  );
}
