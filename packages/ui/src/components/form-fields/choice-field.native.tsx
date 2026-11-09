import type { FieldPath, FieldValues } from "react-hook-form";
import { ChoiceField } from "../choice-field/index.native";
import { type FormChoiceFieldProps, useChoiceBinding } from "./use-choice-binding";

export function FormChoiceField<T extends FieldValues, N extends FieldPath<T>>(
  props: FormChoiceFieldProps<T, N>,
) {
  return <ChoiceField {...useChoiceBinding(props)} />;
}
