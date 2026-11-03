import { parseNumericInput } from "@repo/core/utils/numeric-ux-policy";
import {
  type Control,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
  useFormState,
} from "react-hook-form";
import { useFormDraftResetKey } from "../../hooks/pending-form-drafts";
import { useSemanticInput } from "../../hooks/use-semantic-input";
import { defaultFormatValue, type FormNumberFieldProps } from "./shared";

export function useNumberField<T extends FieldValues, N extends FieldPath<T>>(props: {
  control: Control<T>;
  field: ControllerRenderProps<T, N>;
  label: string;
  allowDecimal: boolean | undefined;
  disabled: boolean | undefined;
  required: boolean | undefined;
  min: number | undefined;
  max: number | undefined;
  emptyValue: FormNumberFieldProps<T, N>["emptyValue"];
  formatValue: FormNumberFieldProps<T, N>["formatValue"];
  parseValue: FormNumberFieldProps<T, N>["parseValue"];
}) {
  const { field, control, formatValue = defaultFormatValue } = props;
  const { isSubmitting } = useFormState({ control });
  const resetKey = useFormDraftResetKey(control);
  const disabled = Boolean(props.disabled || field.disabled || isSubmitting);
  const input = useSemanticInput({
    value: formatValue(field.value),
    identity: resetKey,
    disabled,
    required: props.required,
    formControl: control,
    fieldName: field.name,
    label: props.label,
    commitOn: "blur",
    normalize: String,
    parse: (raw) =>
      parseNumericInput(raw, {
        min: props.min,
        max: props.max,
        precision: props.allowDecimal === false ? "integer" : "decimal",
      }),
    onResult: (result) =>
      field.onChange(
        result.status === "invalid"
          ? Number.NaN
          : result.status === "empty"
            ? props.emptyValue
            : props.parseValue
              ? props.parseValue(String(result.value))
              : result.value,
      ),
    echoes: (result) => [result.status === "valid" ? String(result.value) : "NaN", ""],
    onBlur: field.onBlur,
  });
  return { ...input, disabled };
}
