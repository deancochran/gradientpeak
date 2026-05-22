"use client";

import type { FieldPath, FieldPathValue, FieldValues } from "react-hook-form";

import { cn } from "../../lib/cn";
import { BoundedNumberInput } from "../bounded-number-input/index.web";
import { Button } from "../button/index.web";
import { DateInput } from "../date-input/index.web";
import { DurationInput } from "../duration-input/index.web";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../form/index.web";
import { Input } from "../input/index.web";
import { IntegerStepper } from "../integer-stepper/index.web";
import { PaceInput } from "../pace-input/index.web";
import { PercentSliderInput } from "../percent-slider-input/index.web";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../select/index.web";
import { Switch } from "../switch/index.web";
import { Textarea } from "../textarea/index.web";
import { TimeInput } from "../time-input/index.web";
import { WeightInputField } from "../weight-input-field/index.web";
import {
  defaultFormatValue,
  type FormBoundedNumberFieldProps,
  type FormDateInputFieldProps,
  type FormDateTimeFieldProps,
  type FormDurationFieldProps,
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
              disabled={disabled}
              name={field.name}
              onBlur={field.onBlur}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
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

function FormNumberField<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>>({
  allowDecimal = true,
  control,
  description,
  disabled,
  emptyValue,
  formatValue = defaultFormatValue,
  label,
  max,
  min,
  name,
  parseValue,
  placeholder,
  required,
  rules,
  testId,
}: FormNumberFieldProps<TFieldValues, TName>) {
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
            <Input
              accessibilityLabel={label}
              disabled={disabled}
              inputMode="decimal"
              name={field.name}
              onBlur={field.onBlur}
              onChange={(event) => {
                const raw = event.currentTarget.value.trim();
                if (raw.length === 0) {
                  field.onChange(
                    emptyValue === undefined
                      ? (undefined as FieldPathValue<TFieldValues, TName>)
                      : emptyValue,
                  );
                  return;
                }

                if (parseValue) {
                  field.onChange(parseValue(raw));
                  return;
                }

                const parsed = allowDecimal ? Number(raw) : Number.parseInt(raw, 10);
                if (!Number.isFinite(parsed)) {
                  field.onChange(undefined as FieldPathValue<TFieldValues, TName>);
                  return;
                }

                const bounded = Math.min(max ?? parsed, Math.max(min ?? parsed, parsed));
                field.onChange(bounded as FieldPathValue<TFieldValues, TName>);
              }}
              placeholder={placeholder}
              testId={testId}
              type="text"
              value={formatValue(field.value)}
            />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          {fieldState.error?.message ? (
            <FormMessage>{fieldState.error.message}</FormMessage>
          ) : (
            <FormMessage />
          )}
        </FormItem>
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
        <FormItem className={cn("flex flex-row items-center justify-between gap-4", className)}>
          <div className="space-y-0.5">
            <FormLabel>{label}</FormLabel>
            {description ? <FormDescription>{description}</FormDescription> : null}
          </div>
          <FormControl>
            <Switch
              accessibilityLabel={switchLabel ?? label}
              checked={Boolean(field.value)}
              disabled={disabled}
              id={testId}
              onBlur={field.onBlur}
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
          error={fieldState.error?.message}
          helperText={description}
          id={String(name)}
          label={label}
          max={max}
          min={min}
          onChange={() => undefined}
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
  numberOfLines: _numberOfLines,
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
              disabled={disabled}
              name={field.name}
              onBlur={field.onBlur}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
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
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {label}
            {required ? " *" : null}
          </FormLabel>
          <Select
            disabled={disabled}
            onValueChange={(value) => {
              field.onChange(
                parseValue ? parseValue(value) : (value as FieldPathValue<TFieldValues, TName>),
              );
            }}
            value={
              formatValue
                ? formatValue(field.value)
                : field.value == null
                  ? undefined
                  : String(field.value)
            }
          >
            <FormControl>
              <div data-testid={testId}>
                <SelectTrigger>
                  <SelectValue placeholder={placeholder} />
                </SelectTrigger>
              </div>
            </FormControl>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} disabled={option.disabled} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
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
              <div className="flex flex-wrap gap-2" data-testid={testId}>
                {options.map((option) => {
                  const selected = option.value === selectedValue;

                  return (
                    <Button
                      aria-pressed={selected}
                      className={cn("flex-1", options.length > 3 && "min-w-24")}
                      disabled={disabled || option.disabled}
                      key={option.value}
                      onClick={() => {
                        field.onChange(
                          parseValue
                            ? parseValue(option.value)
                            : (option.value as FieldPathValue<TFieldValues, TName>),
                        );
                      }}
                      type="button"
                      variant={selected ? "default" : "outline"}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
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

function FormDateTimeField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  description,
  disabled,
  label,
  max,
  min,
  name,
  placeholder,
  required,
  rules,
  step,
  testId,
}: FormDateTimeFieldProps<TFieldValues, TName>) {
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
              accessibilityLabel={label}
              disabled={disabled}
              max={max}
              min={min}
              name={field.name}
              onBlur={field.onBlur}
              onChange={(event) => {
                field.onChange(event.currentTarget.value as FieldPathValue<TFieldValues, TName>);
              }}
              placeholder={placeholder}
              step={step}
              testId={testId}
              type="datetime-local"
              value={defaultFormatValue(field.value)}
            />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function FormTimeInputField<
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
  ...timeProps
}: FormTimeInputFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState }) => (
        <FormItem>
          <TimeInput
            {...timeProps}
            error={fieldState.error?.message}
            helperText={description}
            id={String(name)}
            label={label}
            onChange={(value) => field.onChange(value ?? null)}
            required={required}
            testId={testId}
            value={typeof field.value === "string" ? field.value : undefined}
          />
        </FormItem>
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
          error={fieldState.error?.message}
          helperText={description}
          id={String(name)}
          label={label}
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
          error={fieldState.error?.message}
          helperText={description}
          id={String(name)}
          label={label}
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
  disabled: _disabled,
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
          error={fieldState.error?.message}
          helperText={description}
          id={String(name)}
          label={`${label}${required ? " *" : ""}`}
          onChange={(value) => {
            field.onChange(
              parsePercentFieldValue(value, valueMode) as FieldPathValue<TFieldValues, TName>,
            );
          }}
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
