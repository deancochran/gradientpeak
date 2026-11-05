import type { Ref } from "react";
import type { TestProps } from "../../lib/test-props";

export type ChoiceValue = string | number;
export type NativeChoicePresentation = "automatic" | "segmented" | "menu" | "searchable";
export interface ChoiceOption<T extends ChoiceValue> {
  value: T;
  label: string;
  description?: string | undefined;
  disabled?: boolean | undefined;
}
export interface ChoiceFieldProps<T extends ChoiceValue> extends TestProps {
  label: string;
  value: T | null | undefined;
  options: readonly ChoiceOption<T>[];
  onChange: (value: T) => void;
  /** Clearing is an explicit operation; the owner declares null vs undefined. */
  onClear?: (() => void) | undefined;
  onBlur?: (() => void) | undefined;
  disabled?: boolean | undefined;
  required?: boolean | undefined;
  error?: string | undefined;
  helperText?: string | undefined;
  placeholder?: string | undefined;
  ref?: Ref<{ focus: () => void }> | undefined;
  /** A panel is already inside the owner's single-setting fullscreen editor. */
  presentation?: "field" | "panel" | undefined;
  /** Native layout intent; web retains its accessible Select. Long labels never get forced into segments. */
  nativePresentation?: NativeChoicePresentation | undefined;
  isCurrent?: (() => boolean) | undefined;
  resetKey?: string | number | undefined;
  formControl?: object | undefined;
  fieldName?: string | undefined;
}

export function resolveChoice<T extends ChoiceValue>(
  value: unknown,
  options: readonly ChoiceOption<T>[],
) {
  if (value === null || value === undefined || value === "") return { status: "empty" as const };
  const option = options.find((candidate) => candidate.value === value);
  return option && !option.disabled
    ? { status: "valid" as const, option }
    : { status: "invalid" as const, label: option?.label ?? String(value) };
}

export type ChoiceControlProps<T extends ChoiceValue> = Pick<
  ChoiceFieldProps<T>,
  "label" | "value" | "options" | "onChange" | "disabled" | "testId" | "isCurrent"
> & {
  mode: "segmented" | "menu" | "list";
  owner?: object | undefined;
  resetKey?: string | undefined;
};

export function resolveNativeChoicePresentation<T extends ChoiceValue>(
  props: Pick<ChoiceFieldProps<T>, "options" | "presentation" | "nativePresentation">,
  width: number,
  fontScale: number,
): "segmented" | "menu" | "list" | "searchable" {
  if (props.nativePresentation === "searchable" || props.options.length >= 8) return "searchable";
  if (props.presentation === "panel") return "list";
  const shortPair =
    props.options.length === 2 &&
    props.options.every((option) => option.label.length <= 12 && !option.label.includes("\n"));
  const fits =
    shortPair &&
    props.options.reduce((sum, option) => sum + option.label.length, 0) * 8 * fontScale + 64 <=
      width;
  if (props.nativePresentation === "segmented") return fits ? "segmented" : "list";
  if (props.nativePresentation !== "menu" && fits) return "segmented";
  return "menu";
}
