import { useEffect, useRef } from "react";
import { usePendingFormDraft } from "../../hooks/pending-form-drafts";
import { type ChoiceFieldProps, type ChoiceValue, resolveChoice } from "./shared";

export function useChoiceField<T extends ChoiceValue>(
  props: ChoiceFieldProps<T>,
  focus: () => void,
  onDiscard?: () => void,
) {
  const latest = useRef(props);
  latest.current = props;
  const alive = useRef(true);
  const signature = JSON.stringify([
    props.resetKey,
    props.fieldName,
    props.presentation,
    props.nativePresentation,
    props.disabled,
    props.isCurrent?.() ?? true,
    props.options.map(({ value, disabled }) => [value, disabled]),
  ]);
  const owner = useRef({ signature, control: props.formControl, generation: 0 });
  if (owner.current.signature !== signature || owner.current.control !== props.formControl) {
    owner.current = {
      signature,
      control: props.formControl,
      generation: owner.current.generation + 1,
    };
  }
  const generation = owner.current.generation;
  const usable = () =>
    alive.current &&
    !latest.current.disabled &&
    owner.current.generation === generation &&
    (latest.current.isCurrent?.() ?? true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const result = resolveChoice(props.value, props.options);
  const message =
    result.status === "invalid"
      ? `${result.label} is unavailable. Choose a supported ${props.label.toLowerCase()}.`
      : props.required && result.status === "empty"
        ? `Choose ${props.label.toLowerCase()}.`
        : undefined;
  usePendingFormDraft(props.formControl, {
    commit: () => undefined,
    discard: () => {
      owner.current.generation += 1;
      onDiscard?.();
    },
    issue: () => (message && props.fieldName ? { name: props.fieldName, message, focus } : null),
  });
  return {
    result,
    error: props.error ?? message,
    display:
      result.status === "valid"
        ? result.option.label
        : result.status === "invalid"
          ? `${result.label} (unavailable)`
          : (props.placeholder ?? "Choose…"),
    usable,
    invalidate: () => {
      owner.current.generation += 1;
    },
    select: (value: unknown) => {
      if (!usable()) return;
      const next = resolveChoice(value, latest.current.options);
      if (next.status !== "valid") return;
      latest.current.onChange(next.option.value);
      latest.current.onBlur?.();
    },
    clear: () => {
      if (usable() && !latest.current.required) {
        latest.current.onClear?.();
        latest.current.onBlur?.();
      }
    },
    blur: () => {
      if (usable()) latest.current.onBlur?.();
    },
  };
}
