import { useEffect, useRef, useState } from "react";
import {
  type Control,
  type ControllerRenderProps,
  type FieldPath,
  type FieldPathValue,
  type FieldValues,
  useFormState,
} from "react-hook-form";
import { usePendingFormDraft } from "../../hooks/pending-form-drafts";

import { cn } from "../../lib/cn";
import { View } from "../../lib/react-native";
import { BoundedNumberInput } from "../bounded-number-input/index.native";
import { Button } from "../button/index.native";
import { DateInput } from "../date-input/index.native";
import { DurationInput } from "../duration-input/index.native";
import { FileInput } from "../file-input/index.native";
import type { SelectedFile } from "../file-input/shared";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../form/index.native";
import { Input } from "../input/index.native";
import { IntegerStepper } from "../integer-stepper/index.native";
import { PaceInput } from "../pace-input/index.native";
import { PercentSliderInput } from "../percent-slider-input/index.native";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../select/index.native";
import { Switch } from "../switch/index.native";
import { Text } from "../text/index.native";
import { Textarea } from "../textarea/index.native";
import { TimeInput } from "../time-input/index.native";
import { WeightInputField } from "../weight-input-field/index.native";
import {
  defaultFormatValue,
  type FormBoundedNumberFieldProps,
  type FormDateInputFieldProps,
  type FormDateTimeFieldProps,
  type FormDurationFieldProps,
  type FormFileFieldProps,
  type FormIntegerStepperFieldProps,
  type FormNumberFieldProps,
  type FormPaceFieldProps,
  type FormPercentSliderFieldProps,
  type FormSegmentedSelectFieldProps,
  type FormSelectFieldProps,
  type FormSwitchFieldProps,
  type FormTextareaFieldProps,
  type FormTextFieldProps,
  type FormTimeInputFieldProps,
  type FormWeightInputFieldProps,
} from "./shared";

function FormFileField<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>>({
  control,
  description,
  disabled,
  emptyValue,
  label,
  name,
  required,
  rules,
  testId,
  ...fileInputProps
}: FormFileFieldProps<TFieldValues, TName>) {
  const { isSubmitting } = useFormState({ control });
  const isDisabled = disabled || isSubmitting;

  return (
    <FormField
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel>
            {label}
            {required ? " *" : null}
          </FormLabel>
          <FormControl>
            <FileInput
              {...fileInputProps}
              disabled={isDisabled}
              error={fieldState.error?.message}
              files={(Array.isArray(field.value) ? field.value : []) as SelectedFile[]}
              hideLabel
              label={label}
              name={field.name}
              onBlur={field.onBlur}
              onFilesChange={(files) => {
                const nextValue =
                  files.length === 0 && emptyValue !== undefined ? emptyValue : files;
                field.onChange(nextValue as FieldPathValue<TFieldValues, TName>);
              }}
              required={required}
              testId={testId}
            />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
        </FormItem>
      )}
    />
  );
}

function FormTextField<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>>({
  control,
  description,
  disabled,
  formatValue = defaultFormatValue,
  label,
  name,
  parseValue,
  required,
  rules,
  testId,
  ...inputProps
}: FormTextFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      rules={rules}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {label}
            {required ? " *" : null}
          </FormLabel>
          <FormControl>
            <Input
              {...inputProps}
              accessibilityLabel={label}
              editable={!disabled}
              onBlur={field.onBlur}
              onChangeText={(nextValue) => {
                field.onChange(
                  parseValue
                    ? parseValue(nextValue)
                    : (nextValue as FieldPathValue<TFieldValues, TName>),
                );
              }}
              testId={testId}
              value={formatValue(field.value)}
            />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

type NumberFieldControlProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = Omit<FormNumberFieldProps<TFieldValues, TName>, "control" | "name" | "rules"> & {
  control: Control<TFieldValues>;
  error?: string;
  field: ControllerRenderProps<TFieldValues, TName>;
};

function NumberFieldControl<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  allowDecimal = true,
  control,
  description,
  disabled,
  emptyValue,
  error,
  field,
  formatValue = defaultFormatValue,
  label,
  max,
  min,
  parseValue,
  placeholder,
  required,
  testId,
}: NumberFieldControlProps<TFieldValues, TName>) {
  const [draftValue, setDraftValue] = useState(() => formatValue(field.value));
  const draftValueRef = useRef(draftValue);
  const isDraftPendingRef = useRef(false);

  const updateDraftValue = (value: string, pending = true) => {
    draftValueRef.current = value;
    isDraftPendingRef.current = pending;
    setDraftValue(value);
  };

  useEffect(() => {
    const nextValue = formatValue(field.value);
    draftValueRef.current = nextValue;
    isDraftPendingRef.current = false;
    setDraftValue(nextValue);
  }, [field.value, formatValue]);

  const commitDraft = (markTouched = true) => {
    const raw = draftValueRef.current.trim();
    let nextValue: FieldPathValue<TFieldValues, TName>;

    if (!raw) {
      nextValue =
        emptyValue === undefined ? (undefined as FieldPathValue<TFieldValues, TName>) : emptyValue;
    } else if (parseValue) {
      nextValue = parseValue(raw);
    } else {
      const parsed = allowDecimal ? Number(raw) : Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed)) {
        if (markTouched) {
          updateDraftValue(formatValue(field.value), false);
          field.onBlur();
        } else {
          isDraftPendingRef.current = false;
          field.onChange(undefined as FieldPathValue<TFieldValues, TName>);
        }
        return;
      }

      nextValue = Math.min(max ?? parsed, Math.max(min ?? parsed, parsed)) as FieldPathValue<
        TFieldValues,
        TName
      >;
    }

    field.onChange(nextValue);
    updateDraftValue(formatValue(nextValue), false);
    if (markTouched) {
      field.onBlur();
    }
  };

  usePendingFormDraft(control, {
    commit: () => {
      if (isDraftPendingRef.current) {
        commitDraft(false);
      }
    },
    discard: () => updateDraftValue(formatValue(field.value), false),
  });

  const accessibilityHint = [
    required ? "Required" : undefined,
    description,
    error ? `Error: ${error}` : undefined,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <FormItem>
      <FormLabel>
        {label}
        {required ? " *" : null}
      </FormLabel>
      <FormControl>
        <Input
          accessibilityHint={accessibilityHint || undefined}
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
          editable={!disabled}
          keyboardType={allowDecimal ? "decimal-pad" : "numeric"}
          onBlur={() => commitDraft()}
          onChangeText={updateDraftValue}
          placeholder={placeholder}
          testId={testId}
          value={draftValue}
        />
      </FormControl>
      {description ? <FormDescription>{description}</FormDescription> : null}
      {error ? <FormMessage>{error}</FormMessage> : <FormMessage />}
    </FormItem>
  );
}

function FormNumberField<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>>({
  control,
  name,
  rules,
  ...props
}: FormNumberFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState }) => (
        <NumberFieldControl
          {...props}
          control={control}
          error={fieldState.error?.message}
          field={field}
        />
      )}
    />
  );
}

function FormSwitchField<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>>({
  className,
  control,
  description,
  disabled,
  label,
  name,
  rules,
  switchLabel,
  testId,
}: FormSwitchFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      rules={rules}
      render={({ field }) => (
        <FormItem className={cn("flex-row items-center justify-between gap-4 py-2", className)}>
          <FormItem className="flex-1 gap-0.5">
            <FormLabel>{label}</FormLabel>
            {description ? <FormDescription>{description}</FormDescription> : null}
          </FormItem>
          <FormControl>
            <Switch
              accessibilityLabel={switchLabel ?? label}
              checked={Boolean(field.value)}
              disabled={disabled}
              onCheckedChange={field.onChange}
              testId={testId}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}

function FormBoundedNumberField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  decimals,
  description,
  disabled,
  label,
  max,
  min,
  name,
  placeholder,
  presets,
  rules,
  testId,
  unitLabel,
  required,
}: FormBoundedNumberFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState }) => (
        <BoundedNumberInput
          decimals={decimals}
          disabled={disabled}
          error={fieldState.error?.message}
          helperText={description}
          id={String(name)}
          label={label}
          max={max}
          min={min}
          onChange={() => undefined}
          onBlur={field.onBlur}
          onNumberChange={(value) => {
            field.onChange(value as FieldPathValue<TFieldValues, TName>);
          }}
          placeholder={placeholder}
          presets={presets}
          required={required}
          testId={testId}
          unitLabel={unitLabel}
          value={defaultFormatValue(field.value)}
        />
      )}
    />
  );
}

function FormIntegerStepperField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  description,
  label,
  max,
  min,
  name,
  rules,
  step,
  testId,
}: FormIntegerStepperFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState }) => (
        <IntegerStepper
          error={fieldState.error?.message}
          helperText={description}
          id={String(name)}
          label={label}
          max={max}
          min={min}
          onChange={(value) => field.onChange(value as FieldPathValue<TFieldValues, TName>)}
          step={step}
          testId={testId}
          value={typeof field.value === "number" ? field.value : 0}
        />
      )}
    />
  );
}

function FormTextareaField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  description,
  disabled,
  formatValue = defaultFormatValue,
  label,
  name,
  numberOfLines,
  parseValue,
  placeholder,
  required,
  rules,
  testId,
  ...textareaProps
}: FormTextareaFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      rules={rules}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {label}
            {required ? " *" : null}
          </FormLabel>
          <FormControl>
            <Textarea
              {...textareaProps}
              accessibilityLabel={label}
              editable={!disabled}
              numberOfLines={numberOfLines}
              onBlur={field.onBlur}
              onChangeText={(nextValue) => {
                field.onChange(
                  parseValue
                    ? parseValue(nextValue)
                    : (nextValue as FieldPathValue<TFieldValues, TName>),
                );
              }}
              placeholder={placeholder}
              testId={testId}
              value={formatValue(field.value)}
            />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function FormSelectField<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>>({
  control,
  description,
  disabled,
  formatValue,
  label,
  name,
  options,
  parseValue,
  placeholder,
  required,
  rules,
  testId,
}: FormSelectFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      rules={rules}
      render={({ field }) => {
        const selectedValue = formatValue
          ? formatValue(field.value)
          : field.value == null
            ? undefined
            : String(field.value);

        return (
          <FormItem>
            <FormLabel>
              {label}
              {required ? " *" : null}
            </FormLabel>
            <Select
              disabled={disabled}
              onValueChange={(option) => {
                const nextValue = option?.value;
                if (nextValue == null) {
                  return;
                }
                field.onChange(
                  parseValue
                    ? parseValue(nextValue)
                    : (nextValue as FieldPathValue<TFieldValues, TName>),
                );
              }}
              value={
                selectedValue == null
                  ? undefined
                  : ({
                      label:
                        options.find((option) => option.value === selectedValue)?.label ??
                        selectedValue,
                      value: selectedValue,
                    } as never)
              }
            >
              <FormControl>
                <SelectTrigger
                  accessibilityHint={
                    [required ? "Required" : undefined, description].filter(Boolean).join(". ") ||
                    undefined
                  }
                  accessibilityLabel={label}
                  accessibilityState={{ disabled }}
                  aria-required={required}
                  testID={testId}
                >
                  <SelectValue placeholder={placeholder ?? ""} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem
                    key={option.value}
                    disabled={option.disabled}
                    label={option.label}
                    value={option.value}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {description ? <FormDescription>{description}</FormDescription> : null}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

function FormSegmentedSelectField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  description,
  disabled,
  formatValue,
  label,
  name,
  options,
  parseValue,
  required,
  rules,
  testId,
}: FormSegmentedSelectFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      rules={rules}
      render={({ field }) => {
        const selectedValue = formatValue
          ? formatValue(field.value)
          : field.value == null
            ? undefined
            : String(field.value);

        return (
          <FormItem>
            <FormLabel>
              {label}
              {required ? " *" : null}
            </FormLabel>
            <FormControl>
              <View className="flex-row flex-wrap gap-2" testID={testId}>
                {options.map((option) => {
                  const selected = option.value === selectedValue;

                  return (
                    <Button
                      accessibilityRole="button"
                      accessibilityState={{ selected, disabled: disabled || option.disabled }}
                      className={options.length > 3 ? "min-w-[30%] flex-1" : "flex-1"}
                      disabled={disabled || option.disabled}
                      key={option.value}
                      onPress={() => {
                        field.onChange(
                          parseValue
                            ? parseValue(option.value)
                            : (option.value as FieldPathValue<TFieldValues, TName>),
                        );
                      }}
                      testId={testId ? `${testId}-${option.value}` : undefined}
                      variant={selected ? "default" : "outline"}
                    >
                      <Text
                        className={
                          selected
                            ? "text-center text-primary-foreground"
                            : "text-center text-foreground"
                        }
                      >
                        {option.label}
                      </Text>
                    </Button>
                  );
                })}
              </View>
            </FormControl>
            {description ? <FormDescription>{description}</FormDescription> : null}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

function FormDateInputField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  description,
  disabled,
  label,
  name,
  required,
  rules,
  testId,
  ...dateProps
}: FormDateInputFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState }) => (
        <DateInput
          {...dateProps}
          disabled={disabled}
          error={fieldState.error?.message}
          helperText={description}
          id={String(name)}
          label={label}
          onChange={(value) => field.onChange(value ?? null)}
          required={required}
          testId={testId}
          value={typeof field.value === "string" ? field.value : undefined}
        />
      )}
    />
  );
}

function splitDateTimeValue(value: unknown) {
  if (typeof value !== "string") {
    return { date: undefined, time: undefined };
  }

  const [date, timeWithSeconds] = value.split("T");
  const time = timeWithSeconds?.slice(0, 5);
  return {
    date: date || undefined,
    time: time || undefined,
  };
}

function combineDateTimeValue(date: string | undefined, time: string | undefined) {
  if (!date && !time) {
    return null;
  }

  return `${date ?? new Date().toISOString().slice(0, 10)}T${time ?? "00:00"}`;
}

function FormDateTimeField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  dateLabel,
  description,
  disabled,
  label,
  name,
  required,
  rules,
  testId,
  timeLabel,
}: FormDateTimeFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState }) => {
        const { date, time } = splitDateTimeValue(field.value);

        return (
          <View pointerEvents={disabled ? "none" : "auto"} className="gap-3 opacity-100">
            <View className="gap-3 sm:flex-row">
              <DateInput
                disabled={disabled}
                error={fieldState.error?.message}
                helperText={description}
                id={`${String(name)}-date`}
                label={dateLabel ?? `${label} date`}
                onChange={(nextDate) => {
                  field.onChange(
                    combineDateTimeValue(nextDate, time) as FieldPathValue<TFieldValues, TName>,
                  );
                }}
                pickerPresentation="modal"
                required={required}
                testId={testId ? `${testId}-date` : undefined}
                value={date}
              />
              <TimeInput
                disabled={disabled}
                error={fieldState.error?.message}
                id={`${String(name)}-time`}
                label={timeLabel ?? `${label} time`}
                onChange={(nextTime) => {
                  field.onChange(
                    combineDateTimeValue(date, nextTime) as FieldPathValue<TFieldValues, TName>,
                  );
                }}
                pickerPresentation="modal"
                required={required}
                testId={testId ? `${testId}-time` : undefined}
                value={time}
              />
            </View>
          </View>
        );
      }}
    />
  );
}

function FormTimeInputField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  description,
  disabled,
  label,
  name,
  required,
  rules,
  testId,
  ...timeProps
}: FormTimeInputFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState }) => (
        <TimeInput
          {...timeProps}
          disabled={disabled}
          error={fieldState.error?.message}
          helperText={description}
          id={String(name)}
          label={label}
          onChange={(value) => field.onChange(value ?? null)}
          required={required}
          testId={testId}
          value={typeof field.value === "string" ? field.value : undefined}
        />
      )}
    />
  );
}

function FormDurationField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  description,
  disabled,
  label,
  name,
  required,
  rules,
  testId,
  ...durationProps
}: FormDurationFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState }) => (
        <DurationInput
          {...durationProps}
          disabled={disabled}
          error={fieldState.error?.message}
          helperText={description}
          id={String(name)}
          label={label}
          name={field.name}
          onBlur={field.onBlur}
          onChange={(value) => field.onChange(value as FieldPathValue<TFieldValues, TName>)}
          required={required}
          testId={testId}
          value={typeof field.value === "string" ? field.value : ""}
        />
      )}
    />
  );
}

function FormPaceField<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>>({
  control,
  description,
  disabled,
  label,
  name,
  required,
  rules,
  testId,
  ...paceProps
}: FormPaceFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState }) => (
        <PaceInput
          {...paceProps}
          disabled={disabled}
          error={fieldState.error?.message}
          helperText={description}
          id={String(name)}
          label={label}
          name={field.name}
          onBlur={field.onBlur}
          onChange={(value) => field.onChange(value as FieldPathValue<TFieldValues, TName>)}
          required={required}
          testId={testId}
          value={typeof field.value === "string" ? field.value : ""}
        />
      )}
    />
  );
}

function formatPercentFieldValue(value: unknown, valueMode: "percent" | "fraction") {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return valueMode === "fraction" ? value * 100 : value;
}

function parsePercentFieldValue(value: number, valueMode: "percent" | "fraction") {
  return valueMode === "fraction" ? Number((value / 100).toFixed(4)) : value;
}

function FormPercentSliderField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  decimals,
  description,
  disabled,
  label,
  name,
  required,
  rules,
  testId,
  valueMode = "percent",
  ...percentProps
}: FormPercentSliderFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState }) => (
        <PercentSliderInput
          {...percentProps}
          decimals={decimals}
          disabled={disabled}
          error={fieldState.error?.message}
          helperText={description}
          id={String(name)}
          label={label}
          onChange={(value) => {
            field.onChange(
              parsePercentFieldValue(value, valueMode) as FieldPathValue<TFieldValues, TName>,
            );
          }}
          required={required}
          testId={testId}
          value={formatPercentFieldValue(field.value, valueMode)}
        />
      )}
    />
  );
}

function FormWeightInputField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  description,
  label,
  name,
  required,
  rules,
  testId,
  ...weightProps
}: FormWeightInputFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState }) => (
        <WeightInputField
          {...weightProps}
          error={fieldState.error?.message}
          helperText={description}
          id={String(name)}
          label={label}
          onChangeKg={field.onChange}
          required={required}
          testId={testId}
          valueKg={typeof field.value === "number" ? field.value : (field.value ?? null)}
        />
      )}
    />
  );
}

export {
  FormBoundedNumberField,
  FormDateInputField,
  FormDateTimeField,
  FormDurationField,
  FormFileField,
  FormIntegerStepperField,
  FormNumberField,
  FormPaceField,
  FormPercentSliderField,
  FormSegmentedSelectField,
  FormSelectField,
  FormSwitchField,
  FormTextareaField,
  FormTextField,
  FormTimeInputField,
  FormWeightInputField,
};
