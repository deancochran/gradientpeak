import {
  type FieldPath,
  type FieldPathValue,
  type FieldValues,
  useController,
  useFormState,
  useWatch,
} from "react-hook-form";
import { useFormDraftResetKey } from "../../hooks/pending-form-drafts";
import type { ChoiceOption, NativeChoicePresentation } from "../choice-field/shared";
import type { ControlledFieldProps } from "./shared";

export type FormChoiceFieldProps<
  T extends FieldValues,
  N extends FieldPath<T>,
> = ControlledFieldProps<T, N> & {
  options: readonly ChoiceOption<Extract<FieldPathValue<T, N>, string | number>>[];
  clearable?: boolean;
  emptyValue?: FieldPathValue<T, N>;
  placeholder?: string;
  nativePresentation?: NativeChoicePresentation;
};

export function useChoiceBinding<T extends FieldValues, N extends FieldPath<T>>(
  props: FormChoiceFieldProps<T, N>,
) {
  const { field, fieldState } = useController({
    control: props.control,
    name: props.name,
    ...(props.rules ? { rules: props.rules } : {}),
  });
  const { isSubmitting } = useFormState({ control: props.control });
  const resetKey = useFormDraftResetKey(props.control);
  // Controller's cached default can mask an explicit undefined clear. Watch the
  // actual value without a field default, while retaining Controller registration/ref.
  const currentValue = useWatch({ control: props.control, name: props.name, exact: true });
  const value =
    currentValue == null || typeof currentValue === "string" || typeof currentValue === "number"
      ? currentValue
      : String(currentValue);
  return {
    ref: field.ref,
    value,
    label: props.label,
    options: props.options,
    onChange: field.onChange,
    onClear: props.clearable ? () => field.onChange(props.emptyValue) : undefined,
    onBlur: field.onBlur,
    disabled: Boolean(props.disabled || field.disabled || isSubmitting),
    error: fieldState.error?.message,
    helperText: props.description,
    required: props.required,
    placeholder: props.placeholder,
    nativePresentation: props.nativePresentation,
    ...(props.testId === undefined ? {} : { testId: props.testId }),
    resetKey,
    formControl: props.control,
    fieldName: field.name,
  };
}
