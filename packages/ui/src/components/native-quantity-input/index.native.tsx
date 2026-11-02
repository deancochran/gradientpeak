import {
  type QuantityPickerWholeGroup,
  quantityPickerWholeGroups,
  quantityPickerWholeGroupValue,
  quantityPickerWholeValue,
} from "@repo/core/utils/numeric-ux-policy";
import { type Ref, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  Pressable,
  ScrollView,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  type NativeInputSession,
  useNativeInputHandoff,
} from "../../hooks/use-native-input-handoff";
import { getResolvedNativeTheme } from "../../lib/native-theme";
import type { BoundedNumberInputProps } from "../bounded-number-input/shared";
import { useBoundedNumberInput } from "../bounded-number-input/use-bounded-number-input";
import { Button } from "../button/index.native";
import { NativePicker } from "../native-picker/index.native";
import { Text } from "../text/index.native";

export interface NativeQuantityInputProps extends BoundedNumberInputProps {
  ref?: Ref<{ focus: () => void }>;
  label: string;
  /** A panel is composed by an already-open owner, so it never opens another modal. */
  presentation?: "overlay" | "panel";
  /** Parent modal/session guard for embedded panels; stale native picker callbacks are ignored. */
  isCurrent?: () => boolean;
  /** Semantic name for the whole-number column (for example, rpm or repetitions). */
  wholeLabel?: string;
  /** Semantic name for the fractional column when this quantity deliberately permits fractions. */
  fractionLabel?: string;
  /** Compact, labelled summary row for a form that owns the surrounding section. */
  triggerVariant?: "input" | "row";
}

type PickerParts = { fraction: string; groups: number[]; sign: "+" | "-" };

function decimalText(value: string, fallback: number): string {
  const text = value.trim();
  return /^[+-]?\d+(?:\.\d+)?$/.test(text) ? text.replace(/^\+/, "") : String(fallback);
}

function partsFor(
  value: string,
  fallback: number,
  groups: readonly QuantityPickerWholeGroup[],
  integer: boolean,
  positiveOnly: boolean,
): PickerParts {
  const text = decimalText(value, fallback);
  const [, rawSign, whole = "0", fraction = ""] = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text) ?? [];
  const absoluteWhole = Number(whole);
  if (!Number.isSafeInteger(absoluteWhole))
    return partsFor(String(fallback), 0, groups, integer, positiveOnly);
  return {
    fraction: integer ? "" : fraction,
    groups: groups.map((group) => quantityPickerWholeGroupValue(absoluteWhole, group.divisor)),
    sign: rawSign === "-" && !positiveOnly ? "-" : "+",
  };
}

function composeParts(parts: PickerParts, groups: readonly QuantityPickerWholeGroup[]): string {
  const whole = quantityPickerWholeValue(parts.groups, groups);
  const unsigned = `${whole}${parts.fraction ? `.${parts.fraction}` : ""}`;
  return parts.sign === "-" ? `-${unsigned}` : unsigned;
}

function normalFraction(fraction: string, decimals: number): string | undefined {
  if (decimals === 0 || !/^\d*$/.test(fraction)) return undefined;
  const selected = fraction.padEnd(decimals, "0").slice(0, decimals);
  return fraction.slice(decimals).replace(/0/g, "") ? undefined : selected;
}

/** Native UIKit/Android Spinner columns for finite semantic quantities; web retains keyboard input. */
export function NativeQuantityInput(props: NativeQuantityInputProps) {
  const theme = getResolvedNativeTheme(useColorScheme());
  const min = props.min ?? 0;
  const max = props.max;
  const decimals = props.decimals ?? 2;
  const precision = props.precision ?? (decimals === 0 ? "integer" : "decimal");
  if (
    !Number.isSafeInteger(Math.ceil(min)) ||
    !Number.isSafeInteger(Math.ceil(max ?? Number.NaN)) ||
    max === undefined ||
    max < min
  )
    throw new RangeError("NativeQuantityInput requires finite safe-integer bounds.");
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 3)
    throw new RangeError("NativeQuantityInput supports zero to three deliberate decimal places.");

  const groups = useMemo(
    () => quantityPickerWholeGroups(Math.ceil(Math.max(Math.abs(min), Math.abs(max)))),
    [min, max],
  );
  const groupOptions = useMemo(
    () =>
      groups.map((group, index) => {
        // A single integer wheel represents the whole semantic value, not a digit.
        // Do not offer values below its declared minimum (for example HR 0–29).
        const values =
          groups.length === 1 && precision === "integer" && min >= 0 && index === 0
            ? Array.from(
                { length: Math.floor(max) - Math.ceil(min) + 1 },
                (_, offset) => Math.ceil(min) + offset,
              )
            : group.values;
        return values.map((value) => ({ label: String(value), value }));
      }),
    [groups, max, min, precision],
  );
  // Integer presentation prevents authoring new fractions, but old persisted
  // fractions must remain readable and saveable until an explicit wheel choice
  // replaces them. The picker never offers a fractional column in that mode.
  const input = useBoundedNumberInput({ ...props, precision: props.precision ?? "decimal" }, open);
  const parsed = input.result;
  const fallback = parsed.status === "valid" ? parsed.value : min;
  const integer = precision === "integer";
  const positiveOnly = min >= 0;
  const [parts, setParts] = useState(() =>
    partsFor(input.text, fallback, groups, integer, positiveOnly),
  );
  const partsRef = useRef(parts);
  partsRef.current = parts;
  const trigger = useRef<View>(null);
  const [entry, setEntry] = useState<{ session: NativeInputSession; visible: boolean } | null>(
    null,
  );
  const [interacted, setInteracted] = useState(false);
  const originalText = useRef("");
  // Value is deliberately excluded: controlled echoes from our own selection must not revoke the picker.
  const identity = JSON.stringify([props.resetKey, props.fieldName, min, max, decimals, precision]);
  // Embedded panels do not own a native handoff session. Fence their captured
  // callbacks when any presentation/configuration changes instead.
  const configuration = JSON.stringify([
    identity,
    props.presentation,
    props.unitLabel,
    props.wholeLabel,
    props.fractionLabel,
    props.required,
  ]);
  const configurationRef = useRef(configuration);
  const configurationGeneration = useRef(0);
  if (configurationRef.current !== configuration) {
    configurationRef.current = configuration;
    configurationGeneration.current += 1;
  }
  const handoff = useNativeInputHandoff({
    disabled: props.disabled,
    identity,
    owner: props.formControl,
    isCurrent: props.isCurrent,
    focus: () => {
      trigger.current?.focus?.();
      const node = findNodeHandle(trigger.current);
      if (node != null) AccessibilityInfo.setAccessibilityFocus(node);
    },
  });
  useEffect(() => {
    // Reading the reset identity deliberately makes equal-value form resets replace local picker parts.
    if (!identity) return;
    partsRef.current = partsFor(input.text, fallback, groups, integer, positiveOnly);
    setParts(partsRef.current);
  }, [identity, input.text, fallback, groups, integer, positiveOnly]);

  function open() {
    if (props.presentation === "panel") return;
    const session = handoff.begin();
    if (session) {
      const next = partsFor(input.text, fallback, groups, integer, positiveOnly);
      partsRef.current = next;
      setParts(next);
      originalText.current = input.text;
      setInteracted(false);
      setEntry({ session, visible: true });
    }
  }

  const close = (session: NativeInputSession) => {
    if (!session.isLatest()) return;
    session.close();
    setEntry((current) => (current?.session === session ? { session, visible: false } : current));
    props.onBlur?.();
  };
  const cancel = (session: NativeInputSession) => {
    if (!session.isLatest()) return;
    input.change(originalText.current);
    close(session);
  };
  const done = (session: NativeInputSession) => {
    if (!session.isLatest()) return;
    const acceptable = parsed.status === "valid" || (!props.required && parsed.status === "empty");
    if (!acceptable) {
      setInteracted(true);
      return;
    }
    close(session);
  };
  const select = (
    nextPart: Partial<PickerParts>,
    generation: number,
    session?: NativeInputSession,
  ) => {
    if (
      generation !== configurationGeneration.current ||
      !input.isCurrent() ||
      props.disabled ||
      (session && !session.isCurrent()) ||
      (props.isCurrent && !props.isCurrent())
    )
      return;
    const next = { ...partsRef.current, ...nextPart };
    partsRef.current = next;
    setParts(next);
    setInteracted(true);
    // Publish invalid compositions too: form save must never retain a stale canonical value.
    input.change(composeParts(next, groups));
  };
  const display = parsed.status === "empty" ? "Not set" : input.text;
  const rowTrigger = props.triggerVariant === "row";
  const needsRepresentationRepair =
    parsed.status === "invalid" &&
    (parsed.reason !== "range" || (positiveOnly && input.text.trim().startsWith("-")));
  const error =
    props.error ??
    (interacted && (parsed.status === "invalid" || (props.required && parsed.status === "empty"))
      ? `Choose a value from ${min} to ${max}${props.unitLabel ? ` ${props.unitLabel}` : ""}.`
      : undefined);
  const normalizedFraction = normalFraction(parts.fraction, decimals);
  const standardFractions = useMemo(
    () =>
      Array.from({ length: decimals === 0 ? 0 : 10 ** decimals }, (_, value) => {
        const text = String(value).padStart(decimals, "0");
        return { label: `.${text}`, value: text };
      }),
    [decimals],
  );
  const fractionValue = normalizedFraction ?? parts.fraction;
  const fractionOptions =
    decimals === 0
      ? []
      : normalizedFraction === undefined && parts.fraction
        ? [{ label: `.${parts.fraction}`, value: parts.fraction }, ...standardFractions]
        : standardFractions;
  const needsSign = min < 0;
  const wholeLabel =
    props.wholeLabel ?? (groups.length === 1 ? props.unitLabel || "Value" : undefined);
  const fractionLabel = props.fractionLabel ?? `Fractional ${props.unitLabel || "value"}`;
  const active = props.presentation === "panel" || Boolean(entry?.visible && handoff.presented);
  useImperativeHandle(props.ref, () => ({ focus: open }));
  const pickerAvailability = {
    disabled: props.disabled === true,
    isCurrent: () =>
      input.isCurrent() && (props.isCurrent?.() ?? true) && (!entry || entry.session.isCurrent()),
  };
  const currentGeneration = configurationGeneration.current;

  const overlayStyle = entry ? { color: theme.foreground } : undefined;
  const pickerColors = entry
    ? { foregroundColor: theme.foreground, backgroundColor: theme.card }
    : undefined;
  const pane = (
    <ScrollView
      style={props.presentation === "panel" ? undefined : { flexShrink: 1, minHeight: 0 }}
      contentContainerStyle={{ padding: props.presentation === "panel" ? 0 : 16 }}
    >
      <Text
        accessibilityLiveRegion="none"
        className="mb-2 text-sm font-medium"
        style={overlayStyle}
      >
        {display}
        {props.unitLabel ? ` ${props.unitLabel}` : ""}
      </Text>
      <View className="flex-row gap-2">
        {needsSign ? (
          <View className="flex-1">
            <Text style={overlayStyle}>Sign</Text>
            <NativePicker
              {...pickerAvailability}
              {...pickerColors}
              label={`${props.label} sign`}
              value={parts.sign}
              options={[
                { label: "+", value: "+" },
                { label: "−", value: "-" },
              ]}
              onChange={(sign) => select({ sign }, currentGeneration, entry?.session)}
            />
          </View>
        ) : null}
        {groups.map((group, index) => (
          <View key={group.divisor} className="flex-1">
            <Text style={overlayStyle}>{groups.length === 1 ? wholeLabel : group.label}</Text>
            <NativePicker<number | string>
              {...pickerAvailability}
              {...pickerColors}
              label={`${props.label} ${groups.length === 1 ? wholeLabel : group.label}`}
              value={
                parsed.status === "empty"
                  ? ""
                  : index === 0 && needsRepresentationRepair
                    ? input.text
                    : (parts.groups[index] ?? 0)
              }
              options={groupOptions[index] ?? []}
              onChange={(value) => {
                if (typeof value !== "number") return;
                const nextGroups = [...partsRef.current.groups];
                nextGroups[index] = value;
                select({ groups: nextGroups }, currentGeneration, entry?.session);
              }}
            />
          </View>
        ))}
        {decimals > 0 ? (
          <View className="flex-1">
            <Text style={overlayStyle}>{fractionLabel}</Text>
            <NativePicker
              {...pickerAvailability}
              {...pickerColors}
              label={`${props.label} ${fractionLabel}`}
              value={parsed.status === "empty" ? "" : fractionValue || "0".repeat(decimals)}
              options={fractionOptions}
              onChange={(fraction) => select({ fraction }, currentGeneration, entry?.session)}
            />
          </View>
        ) : null}
      </View>
      {error ? (
        <Text accessibilityRole="alert" className="mt-3 text-destructive" style={overlayStyle}>
          {error}
        </Text>
      ) : null}
      {props.helperText ? (
        <Text className="mt-3 text-xs text-muted-foreground" style={overlayStyle}>
          {props.helperText}
        </Text>
      ) : null}
      {!props.required && parsed.status !== "empty" ? (
        <Button
          disabled={props.disabled === true}
          variant="ghost"
          accessibilityLabel={`Clear ${props.label}`}
          onPress={() => {
            if (
              props.disabled ||
              currentGeneration !== configurationGeneration.current ||
              !pickerAvailability.isCurrent()
            )
              return;
            const next = { fraction: "", groups: groups.map(() => 0), sign: "+" as const };
            partsRef.current = next;
            setParts(next);
            setInteracted(true);
            input.change("");
          }}
        >
          <Text style={overlayStyle}>Clear</Text>
        </Button>
      ) : null}
    </ScrollView>
  );
  return (
    <View className="gap-2">
      {props.presentation !== "panel" ? (
        <Pressable
          ref={trigger}
          accessibilityRole="button"
          accessibilityLabel={props.label}
          accessibilityValue={{ text: display }}
          accessibilityState={{ disabled: Boolean(props.disabled), expanded: active }}
          disabled={props.disabled}
          testID={props.testId}
          onPress={open}
          className={
            rowTrigger
              ? "min-h-12 flex-row items-center justify-between border-b border-border py-3"
              : "min-h-12 rounded-md border border-input p-3"
          }
        >
          {rowTrigger ? <Text className="text-sm font-medium">{props.label}</Text> : null}
          <Text {...(rowTrigger ? { className: "text-sm text-muted-foreground" } : {})}>
            {display}
            {props.unitLabel ? ` ${props.unitLabel}` : ""}
          </Text>
        </Pressable>
      ) : null}
      {error && !active ? (
        <Text accessibilityRole="alert" className="text-destructive">
          {error}
        </Text>
      ) : null}
      {props.presentation === "panel" ? (
        pane
      ) : entry ? (
        <Modal
          transparent
          visible={active}
          animationType="slide"
          onRequestClose={() => cancel(entry.session)}
          onDismiss={() => entry.session.restoreFocus()}
        >
          <View
            className="flex-1 justify-end bg-black/40"
            testID={`${props.testId ?? props.label}-quantity-overlay`}
          >
            <SafeAreaView
              edges={["bottom"]}
              testID={`${props.testId ?? props.label}-quantity-surface`}
              className="overflow-hidden rounded-t-2xl"
              style={{ backgroundColor: theme.card, flexShrink: 1, maxHeight: "80%", minHeight: 0 }}
            >
              <View className="flex-row items-center justify-between border-b border-border p-4">
                <Button
                  variant="ghost"
                  accessibilityLabel={`Cancel ${props.label}`}
                  onPress={() => cancel(entry.session)}
                >
                  <Text style={{ color: theme.foreground }}>Cancel</Text>
                </Button>
                <Text
                  accessibilityRole="header"
                  className="text-xl font-semibold"
                  style={{ color: theme.foreground }}
                >
                  {props.label}
                </Text>
                <Button
                  variant="ghost"
                  accessibilityLabel={`Done ${props.label}`}
                  onPress={() => done(entry.session)}
                >
                  <Text style={{ color: theme.foreground }}>Done</Text>
                </Button>
              </View>
              {pane}
            </SafeAreaView>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
