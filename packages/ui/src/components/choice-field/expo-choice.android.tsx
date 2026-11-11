import {
  Column,
  DropdownMenu,
  DropdownMenuItem,
  Host,
  RadioButton,
  RNHostView,
  Row,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text,
  useMaterialColors,
} from "@expo/ui/jetpack-compose";
import {
  defaultMinSize,
  fillMaxWidth,
  padding,
  selectable,
  selectableGroup,
} from "@expo/ui/jetpack-compose/modifiers";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, findNodeHandle, Pressable, type View } from "react-native";
import {
  type NativeInputSession,
  useNativeInputHandoff,
} from "../../hooks/use-native-input-handoff";
import { Text as RNText } from "../text/index.native";
import { type ChoiceControlProps, type ChoiceValue, resolveChoice } from "./shared";

function Popup<T extends ChoiceValue>(props: ChoiceControlProps<T>) {
  const [session, setSession] = useState<NativeInputSession | null>(null);
  const trigger = useRef<View>(null);
  const identity = JSON.stringify([
    props.resetKey,
    props.options.map(({ value, disabled }) => [value, disabled]),
  ]);
  const handoff = useNativeInputHandoff({
    disabled: props.disabled,
    identity,
    owner: props.owner,
    isCurrent: props.isCurrent,
    onSuperseded: () => setSession(null),
    focus: () => {
      trigger.current?.focus?.();
      const node = findNodeHandle(trigger.current);
      if (node != null) AccessibilityInfo.setAccessibilityFocus(node);
    },
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: end a popup when its owner/options change.
  useEffect(() => setSession(null), [props.disabled, props.owner, identity]);
  const close = (ticket: NativeInputSession) => {
    if (!ticket.isLatest()) return;
    ticket.close();
    setSession((current) => (current === ticket ? null : current));
    requestAnimationFrame(ticket.restoreFocus);
  };
  const result = resolveChoice(props.value, props.options);
  return (
    <Host matchContents={{ vertical: true }} style={{ width: "100%" }} ignoreSafeAreaKeyboardInsets>
      <DropdownMenu
        expanded={Boolean(session)}
        onDismissRequest={() => {
          if (session) close(session);
        }}
      >
        <DropdownMenu.Trigger>
          <RNHostView matchContents>
            <Pressable
              ref={trigger}
              accessibilityRole="button"
              accessibilityLabel={props.label}
              accessibilityState={{ disabled: Boolean(props.disabled), expanded: Boolean(session) }}
              disabled={props.disabled}
              testID={props.testId}
              className="min-h-12 rounded-md border border-input p-3"
              onPress={() => {
                const ticket = handoff.begin();
                if (ticket) setSession(ticket);
              }}
            >
              <RNText>
                {result.status === "valid"
                  ? result.option.label
                  : result.status === "invalid"
                    ? `${result.label} (unavailable)`
                    : "Choose…"}
              </RNText>
            </Pressable>
          </RNHostView>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          {props.options.map((option) => (
            <DropdownMenuItem
              key={`${typeof option.value}:${option.value}`}
              enabled={!props.disabled && !option.disabled}
              onClick={() => {
                if (!session?.isCurrent() || props.disabled || option.disabled) return;
                props.onChange(option.value);
                close(session);
              }}
            >
              <DropdownMenuItem.Text>
                <Text>{option.label}</Text>
              </DropdownMenuItem.Text>
              {props.value === option.value ? (
                <DropdownMenuItem.TrailingIcon>
                  <Text>✓</Text>
                </DropdownMenuItem.TrailingIcon>
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenu.Items>
      </DropdownMenu>
    </Host>
  );
}

export function ExpoChoiceControl<T extends ChoiceValue>(props: ChoiceControlProps<T>) {
  const colors = useMaterialColors();
  if (props.mode === "menu") return <Popup {...props} />;
  return (
    <Host matchContents={{ vertical: true }} style={{ width: "100%" }} ignoreSafeAreaKeyboardInsets>
      {props.mode === "segmented" ? (
        <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
          {props.options.map((option) => (
            <SegmentedButton
              key={`${typeof option.value}:${option.value}`}
              selected={props.value === option.value}
              enabled={!props.disabled && !option.disabled}
              onClick={() => {
                if (!props.disabled && !option.disabled) props.onChange(option.value);
              }}
            >
              <SegmentedButton.Label>
                <Text>{option.label}</Text>
              </SegmentedButton.Label>
            </SegmentedButton>
          ))}
        </SingleChoiceSegmentedButtonRow>
      ) : (
        <Column modifiers={[fillMaxWidth(), selectableGroup()]}>
          {props.options.map((option) => (
            <Row
              key={`${typeof option.value}:${option.value}`}
              verticalAlignment="center"
              modifiers={[
                fillMaxWidth(),
                defaultMinSize({ minHeight: 56 }),
                padding(0, 8, 0, 8),
                ...(!props.disabled && !option.disabled
                  ? [
                      selectable(
                        props.value === option.value,
                        () => props.onChange(option.value),
                        "radioButton",
                      ),
                    ]
                  : []),
              ]}
            >
              <RadioButton
                selected={props.value === option.value}
                enabled={!props.disabled && !option.disabled}
              />
              <Text color={colors.onBackground}>
                {option.label}
                {option.disabled ? " (unavailable)" : ""}
              </Text>
            </Row>
          ))}
        </Column>
      )}
    </Host>
  );
}
