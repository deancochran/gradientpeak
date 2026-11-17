import type { NumericInputResult } from "@repo/core/utils/numeric-ux-policy";
import { useEffect, useLayoutEffect, useRef } from "react";
import { usePendingFormDraft } from "./pending-form-drafts";
import { useInputDraft } from "./use-input-draft";

/** Transient text for a mounted semantic control; no storage or cross-form ownership. */
export function useSemanticInput(options: {
  value: string;
  identity?: string | number | undefined;
  disabled?: boolean | undefined;
  required?: boolean | undefined;
  parse: (raw: string) => NumericInputResult;
  onText?: ((raw: string, result: NumericInputResult) => void) | undefined;
  onResult?: ((result: NumericInputResult) => void) | undefined;
  onInvalidChange?: ((invalid: boolean) => void) | undefined;
  onBlur?: (() => void) | undefined;
  echoes?: ((result: NumericInputResult) => string[]) | undefined;
  commitOn?: "change" | "blur" | undefined;
  formControl?: object | undefined;
  fieldName?: string | undefined;
  label?: string | undefined;
  focus?: (() => void) | undefined;
  normalize?: ((value: number) => string) | undefined;
}) {
  const identity = JSON.stringify([options.fieldName, options.identity]);
  const [text, setText, state] = useInputDraft(options.value, identity);
  const latest = useRef(options);
  latest.current = options;
  const alive = useRef(true);
  const availability = useRef({
    disabled: Boolean(options.disabled),
    identity,
    control: options.formControl,
    generation: 0,
  });
  if (
    availability.current.disabled !== Boolean(options.disabled) ||
    availability.current.identity !== identity ||
    availability.current.control !== options.formControl
  ) {
    availability.current = {
      disabled: Boolean(options.disabled),
      identity,
      control: options.formControl,
      generation: availability.current.generation + 1,
    };
  }
  const generation = availability.current.generation;
  const usable = () =>
    alive.current && !latest.current.disabled && availability.current.generation === generation;
  const pending = useRef(false);
  const reportedInvalid = useRef(false);
  const owner = useRef(options.formControl);
  useLayoutEffect(() => {
    if (owner.current !== options.formControl) {
      owner.current = options.formControl;
      pending.current = false;
      state.reset(options.value);
    }
  }, [options.formControl, options.value, state]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const publish = (result: NumericInputResult) => {
    latest.current.onResult?.(result);
    reportedInvalid.current =
      result.status === "invalid" ||
      (Boolean(latest.current.required) && result.status === "empty");
    latest.current.onInvalidChange?.(reportedInvalid.current);
  };
  const result = options.parse(text);
  const invalid =
    result.status === "invalid" || (Boolean(options.required) && result.status === "empty");
  useEffect(() => {
    if (reportedInvalid.current === invalid) return;
    reportedInvalid.current = invalid;
    latest.current.onInvalidChange?.(invalid);
  }, [invalid]);
  const commit = () => {
    if (!usable() || !state.edited.current) return;
    if (pending.current) publish(latest.current.parse(state.current.current));
    pending.current = false;
  };
  usePendingFormDraft(options.formControl, {
    commit,
    discard: () => {
      availability.current.generation += 1;
      pending.current = false;
      state.reset(latest.current.value);
      latest.current.onInvalidChange?.(false);
    },
    issue: () =>
      alive.current &&
      latest.current.fieldName &&
      (latest.current.parse(state.current.current).status === "invalid" ||
        (latest.current.required && latest.current.parse(state.current.current).status === "empty"))
        ? {
            name: latest.current.fieldName,
            message: `Enter a valid ${latest.current.label ?? "number"}${latest.current.required ? "." : " or clear the field."}`,
            focus: latest.current.focus,
          }
        : null,
  });
  const change = (raw: string) => {
    if (!usable()) return;
    const result = latest.current.parse(raw);
    setText(
      raw,
      latest.current.echoes?.(result) ?? [result.status === "valid" ? String(result.value) : ""],
    );
    pending.current = true;
    latest.current.onText?.(raw, result);
    if (latest.current.commitOn !== "blur") {
      publish(result);
      pending.current = false;
    } else
      latest.current.onInvalidChange?.(
        result.status === "invalid" ||
          (Boolean(latest.current.required) && result.status === "empty"),
      );
  };
  return {
    isCurrent: usable,
    text,
    result,
    change,
    commit,
    blur: () => {
      commit();
      if (!usable()) return;
      const parsed = latest.current.parse(state.current.current);
      if (state.edited.current && parsed.status === "valid" && latest.current.normalize) {
        setText(latest.current.normalize(parsed.value), latest.current.echoes?.(parsed));
      }
      latest.current.onBlur?.();
    },
    adjust: (value: number) => {
      if (!usable() || latest.current.parse(String(value)).status !== "valid") return;
      const result = { status: "valid" as const, value };
      setText(String(value), latest.current.echoes?.(result) ?? [String(value)]);
      pending.current = false;
      latest.current.onText?.(String(value), result);
      publish(result);
    },
  };
}
