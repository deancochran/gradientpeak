import { useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import {
  type NativeInputSession,
  useNativeInputHandoff,
} from "../../hooks/use-native-input-handoff";
import { getResolvedNativeTheme } from "../../lib/native-theme";
import { Button } from "../button/index.native";
import { Input } from "../input/index.native";
import { Text } from "../text/index.native";
import { ExpoChoiceControl } from "./expo-choice";
import {
  type ChoiceFieldProps,
  type ChoiceValue,
  resolveChoice,
  resolveNativeChoicePresentation,
} from "./shared";
import { useChoiceField } from "./use-choice-field";

type ChoiceSheet = { session: NativeInputSession; visible: boolean };

export function ChoiceField<T extends ChoiceValue>(props: ChoiceFieldProps<T>) {
  const theme = getResolvedNativeTheme(useColorScheme());
  const dimensions = useWindowDimensions();
  const [width, setWidth] = useState<number>();
  const [sheet, setSheet] = useState<ChoiceSheet | null>(null);
  const [query, setQuery] = useState("");
  const trigger = useRef<View>(null);
  const focus = () => {
    trigger.current?.focus?.();
    const handle = findNodeHandle(trigger.current);
    if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle);
  };
  useImperativeHandle(props.ref, () => ({ focus }));
  const policy = resolveNativeChoicePresentation(
    props,
    width ?? dimensions.width - 48,
    dimensions.fontScale ?? 1,
  );
  const hiddenLayout = width === 0;
  const panel = props.presentation === "panel";
  const identity = JSON.stringify([
    props.resetKey,
    props.fieldName,
    policy,
    panel,
    hiddenLayout,
    props.isCurrent?.() ?? true,
    props.options.map(({ value, disabled }) => [value, disabled]),
  ]);
  const handoff = useNativeInputHandoff({
    identity,
    owner: props.formControl,
    disabled: props.disabled || hiddenLayout,
    isCurrent: props.isCurrent,
    focus,
  });
  const choice = useChoiceField(
    { ...props, disabled: props.disabled || hiddenLayout },
    focus,
    () => {
      handoff.invalidate();
      setSheet(null);
      setQuery("");
    },
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: these transitions end the old overlay owner.
  useEffect(() => {
    setSheet(null);
    setQuery("");
  }, [identity, props.disabled, props.formControl]);
  const finishDismissal = (session: NativeInputSession) => {
    if (!session.isLatest()) return;
    session.restoreFocus();
    setSheet((current) => (current?.session === session && !current.visible ? null : current));
  };
  const close = (session: NativeInputSession) => {
    if (!session.isLatest()) return;
    session.close();
    choice.invalidate();
    setSheet((current) =>
      current?.session === session ? { ...current, visible: false } : current,
    );
    props.onBlur?.();
    // RN Modal's onDismiss is iOS-only. Android restores after the close render.
    if (Platform.OS === "android") requestAnimationFrame(() => finishDismissal(session));
  };
  const clear =
    props.onClear && !props.required && choice.result.status !== "empty" ? (
      <Button
        variant="ghost"
        disabled={props.disabled}
        accessibilityLabel={`Clear ${props.label}`}
        onPress={choice.clear}
      >
        <Text>Clear</Text>
      </Button>
    ) : null;
  const visibleOptions = query.trim()
    ? props.options.filter((option) =>
        `${option.label} ${option.description ?? ""}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
      )
    : props.options;
  const control = (session?: NativeInputSession) =>
    hiddenLayout ? null : (
      <View className="gap-3">
        {policy === "searchable" ? (
          <Input
            accessibilityLabel={`Search ${props.label}`}
            placeholder="Search options"
            value={query}
            onChangeText={(text) => {
              if (choice.usable() && (!session || session.isCurrent())) {
                choice.invalidate();
                setQuery(text);
              }
            }}
            editable={!props.disabled}
          />
        ) : null}
        <View
          onStartShouldSetResponderCapture={() => {
            handoff.prepare();
            return false;
          }}
        >
          {visibleOptions.length ? (
            <ExpoChoiceControl
              key={`${identity}:${Boolean(props.disabled)}`}
              label={props.label}
              value={props.value}
              options={visibleOptions}
              disabled={props.disabled}
              owner={props.formControl}
              isCurrent={() => choice.usable() && (!session || session.isCurrent())}
              resetKey={identity}
              mode={policy === "searchable" ? "list" : policy}
              testId={`${props.testId ?? props.id ?? props.label}-picker`}
              onChange={(value) => {
                if (
                  !choice.usable() ||
                  (session && !session.isCurrent()) ||
                  resolveChoice(value, props.options).status !== "valid"
                )
                  return;
                Keyboard.dismiss();
                choice.select(value);
                if (session) close(session);
              }}
            />
          ) : (
            <Text accessibilityRole="alert">No matching {props.label.toLowerCase()} choices.</Text>
          )}
        </View>
        {clear}
        {policy !== "menu" ? (
          visibleOptions
            .filter((option) => option.description)
            .map((option) => (
              <Text
                key={`${typeof option.value}:${option.value}`}
                className="text-sm text-muted-foreground"
              >
                <Text className="font-semibold">{option.label}</Text>
                {" — "}
                {option.description}
              </Text>
            ))
        ) : choice.result.status === "valid" && choice.result.option.description ? (
          <Text className="text-xs text-muted-foreground">{choice.result.option.description}</Text>
        ) : null}
      </View>
    );
  const ownsSearchSheet = policy === "searchable" && !panel;
  return (
    <View className="gap-2" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {ownsSearchSheet ? (
        <Pressable
          ref={trigger}
          focusable
          accessibilityRole="button"
          accessibilityLabel={props.label}
          accessibilityValue={{ text: choice.display }}
          accessibilityState={{
            disabled: Boolean(props.disabled),
            expanded: Boolean(sheet?.visible),
          }}
          disabled={props.disabled}
          testID={props.testId}
          onPress={() => {
            if (!choice.usable()) return;
            const session = handoff.begin();
            if (session) {
              setQuery("");
              setSheet({ session, visible: true });
            }
          }}
          className="min-h-12 rounded-md border border-input p-3"
        >
          <Text className="text-sm font-medium">
            {props.label}
            {props.required ? " *" : ""}
          </Text>
          <Text>{choice.display}</Text>
        </Pressable>
      ) : (
        <View
          ref={trigger}
          accessible
          accessibilityLabel={`${props.label}: ${choice.display}`}
          accessibilityState={{ disabled: Boolean(props.disabled) }}
          testID={props.testId}
        >
          <Text className="font-medium">
            {props.label}
            {props.required ? " *" : ""}
          </Text>
          {choice.result.status === "invalid" ? <Text>{choice.display}</Text> : null}
        </View>
      )}
      {!ownsSearchSheet ? control() : !sheet?.visible ? clear : null}
      {props.helperText ? (
        <Text className="text-xs text-muted-foreground">{props.helperText}</Text>
      ) : null}
      {choice.error ? (
        <Text accessibilityRole="alert" className="text-xs text-destructive">
          {choice.error}
        </Text>
      ) : null}
      {ownsSearchSheet && sheet ? (
        <Modal
          visible={sheet.visible && handoff.presented}
          presentationStyle="fullScreen"
          animationType="slide"
          onRequestClose={() => close(sheet.session)}
          onDismiss={() => finishDismissal(sheet.session)}
        >
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <SafeAreaView style={{ flex: 1, backgroundColor: theme.card }}>
              <View className="flex-row items-center justify-between p-4">
                <Text accessibilityRole="header" className="text-xl font-semibold">
                  {props.label}
                </Text>
                <Button
                  variant="ghost"
                  accessibilityLabel={`Close ${props.label}`}
                  onPress={() => close(sheet.session)}
                >
                  <Text>Close</Text>
                </Button>
              </View>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: 16 }}
              >
                {control(sheet.session)}
                {choice.error ? <Text accessibilityRole="alert">{choice.error}</Text> : null}
              </ScrollView>
            </SafeAreaView>
          </SafeAreaProvider>
        </Modal>
      ) : null}
    </View>
  );
}
export type { ChoiceFieldProps, ChoiceOption } from "./shared";
