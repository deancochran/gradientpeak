"use client";

import { Popover } from "radix-ui";
import { useState } from "react";
import {
  type Control,
  type ControllerRenderProps,
  type FieldPath,
  type FieldPathValue,
  type FieldValues,
  useFormState,
  useWatch,
} from "react-hook-form";
import { useFormDraftResetKey } from "../../hooks/pending-form-drafts";
import { cn } from "../../lib/cn";
import { BoundedNumberInput } from "../bounded-number-input/index.web";
import { Button } from "../button/index.web";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "../command/index.web";
import { DateInput } from "../date-input/index.web";
import { DurationInput } from "../duration-input/index.web";
import { FileInput } from "../file-input/index.web";
import type { SelectedFile } from "../file-input/shared";
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
  type FormTimezoneFieldProps,
  type FormWeightInputFieldProps,
  filterTimezoneOptions,
  getTimezoneOptions,
  omitUndefined,
} from "./shared";
import { useNumberField } from "./use-number-field";

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
      {...omitUndefined({ rules })}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {label}
            {required ? " *" : null}
          </FormLabel>
          <FormControl>
            <FileInput
              {...fileInputProps}
              disabled={isDisabled}
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
              {...omitUndefined({ required, testId })}
            />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
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
  selectTextOnFocus: _selectTextOnFocus,
  testId,
  ...inputProps
}: FormTextFieldProps<TFieldValues, TName>) {
  const { isSubmitting } = useFormState({ control });

  return (
    <FormField
      control={control}
      name={name}
      {...omitUndefined({ rules })}
      render={({ field }) => {
        const isDisabled = disabled || field.disabled || isSubmitting;

        return (
          <FormItem>
            <FormLabel>
              {label}
              {required ? " *" : null}
            </FormLabel>
            <FormControl>
              <Input
                {...inputProps}
                accessibilityLabel={label}
                disabled={isDisabled}
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
                {...omitUndefined({ required, testId })}
                inputRef={field.ref}
                value={formatValue(field.value)}
              />
            </FormControl>
            {description ? <FormDescription>{description}</FormDescription> : null}
            <FormMessage />
          </FormItem>
        );
      }}
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
  const input = useNumberField({
    control,
    field,
    label,
    allowDecimal,
    disabled,
    emptyValue,
    formatValue,
    min,
    max,
    parseValue,
    required,
  });
  const isDisabled = input.disabled;

  return (
    <FormItem>
      <FormLabel>
        {label}
        {required ? " *" : null}
      </FormLabel>
      <FormControl>
        <Input
          accessibilityLabel={label}
          disabled={isDisabled}
          inputMode={allowDecimal ? "decimal" : "numeric"}
          name={field.name}
          onBlur={input.blur}
          onChange={(event) => input.change(event.currentTarget.value)}
          {...omitUndefined({ placeholder, required, testId })}
          inputRef={field.ref}
          type="text"
          value={input.text}
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
      {...omitUndefined({ rules })}
      render={({ field, fieldState }) => (
        <NumberFieldControl
          {...props}
          control={control}
          {...omitUndefined({ error: fieldState.error?.message })}
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
      {...omitUndefined({ rules })}
      render={({ field }) => (
        <FormItem className={cn("flex flex-row items-center justify-between gap-4", className)}>
          <div className="flex-1 space-y-0.5">
            <FormLabel>{label}</FormLabel>
            {description ? <FormDescription>{description}</FormDescription> : null}
            <FormMessage />
          </div>
          <FormControl>
            <Switch
              accessibilityLabel={switchLabel ?? label}
              checked={Boolean(field.value)}
              {...omitUndefined({ disabled, id: testId, testId })}
              onBlur={field.onBlur}
              onCheckedChange={field.onChange}
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
  emptyValue,
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
  const resetKey = useFormDraftResetKey(control);
  const { isSubmitting } = useFormState({ control });
  return (
    <FormField
      control={control}
      name={name}
      {...omitUndefined({ rules })}
      render={({ field, fieldState }) => (
        <BoundedNumberInput
          ref={field.ref}
          formControl={control}
          fieldName={field.name}
          resetKey={resetKey}
          {...omitUndefined({ decimals })}
          disabled={disabled || field.disabled || isSubmitting}
          {...omitUndefined({ error: fieldState.error?.message, helperText: description })}
          id={String(name)}
          label={label}
          {...omitUndefined({ max, min })}
          onChange={() => undefined}
          onBlur={field.onBlur}
          onInputResult={(result) =>
            field.onChange(
              result.status === "valid"
                ? result.value
                : result.status === "empty"
                  ? emptyValue
                  : Number.NaN,
            )
          }
          {...omitUndefined({ placeholder, presets, required, testId, unitLabel })}
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
  emptyValue,
  disabled,
  label,
  max,
  min,
  name,
  required = false,
  rules,
  step,
  testId,
}: FormIntegerStepperFieldProps<TFieldValues, TName>) {
  const { isSubmitting } = useFormState({ control });
  const resetKey = useFormDraftResetKey(control);

  return (
    <FormField
      control={control}
      name={name}
      {...omitUndefined({ rules })}
      render={({ field, fieldState }) => (
        <IntegerStepper
          required={required}
          ref={field.ref}
          formControl={control}
          fieldName={field.name}
          resetKey={resetKey}
          onBlur={field.onBlur}
          disabled={disabled || field.disabled || isSubmitting}
          {...omitUndefined({ error: fieldState.error?.message, helperText: description })}
          id={String(name)}
          label={label}
          {...omitUndefined({ max, min })}
          onChange={() => undefined}
          onInputResult={(result) =>
            field.onChange(
              result.status === "valid"
                ? result.value
                : result.status === "empty"
                  ? emptyValue
                  : Number.NaN,
            )
          }
          {...omitUndefined({ step, testId })}
          value={typeof field.value === "number" ? field.value : null}
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
  onContentSizeChange: _onContentSizeChange,
  parseValue,
  placeholder,
  required,
  rules,
  scrollEnabled: _scrollEnabled,
  style: _style,
  testId,
  ...textareaProps
}: FormTextareaFieldProps<TFieldValues, TName>) {
  const { isSubmitting } = useFormState({ control });

  return (
    <FormField
      control={control}
      name={name}
      {...omitUndefined({ rules })}
      render={({ field }) => {
        const isDisabled = disabled || field.disabled || isSubmitting;

        return (
          <FormItem>
            <FormLabel>
              {label}
              {required ? " *" : null}
            </FormLabel>
            <FormControl>
              <Textarea
                {...textareaProps}
                accessibilityLabel={label}
                disabled={isDisabled}
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
                {...omitUndefined({ placeholder, required, testId })}
                inputRef={field.ref}
                value={formatValue(field.value)}
              />
            </FormControl>
            {description ? <FormDescription>{description}</FormDescription> : null}
            <FormMessage />
          </FormItem>
        );
      }}
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
      {...omitUndefined({ rules })}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {label}
            {required ? " *" : null}
          </FormLabel>
          <Select
            {...omitUndefined({ disabled })}
            onValueChange={(value) => {
              field.onChange(
                parseValue ? parseValue(value) : (value as FieldPathValue<TFieldValues, TName>),
              );
            }}
            {...omitUndefined({
              value: formatValue
                ? formatValue(field.value)
                : field.value == null
                  ? undefined
                  : String(field.value),
            })}
          >
            <FormControl>
              <SelectTrigger aria-label={label} aria-required={required} data-testid={testId}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((option) => (
                <SelectItem
                  key={option.value}
                  {...omitUndefined({ disabled: option.disabled })}
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
      {...omitUndefined({ rules })}
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
  disabled,
  label,
  name,
  required,
  rules,
  testId,
  ...dateProps
}: FormDateInputFieldProps<TFieldValues, TName>) {
  const { isSubmitting } = useFormState({ control });
  const resetKey = useFormDraftResetKey(control);
  return (
    <FormField
      control={control}
      name={name}
      {...omitUndefined({ rules })}
      render={({ field, fieldState }) => (
        <DateInput
          {...dateProps}
          ref={field.ref}
          onBlur={field.onBlur}
          resetKey={resetKey}
          disabled={disabled || field.disabled || isSubmitting}
          {...omitUndefined({ error: fieldState.error?.message, helperText: description })}
          id={String(name)}
          label={label}
          name={field.name}
          onChange={(value) => field.onChange(value ?? null)}
          {...omitUndefined({
            required,
            testId,
            value: typeof field.value === "string" ? field.value : undefined,
          })}
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
      {...omitUndefined({ rules })}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {label}
            {required ? " *" : null}
          </FormLabel>
          <FormControl>
            <Input
              accessibilityLabel={label}
              {...omitUndefined({ disabled, max, min })}
              name={field.name}
              onBlur={field.onBlur}
              onChange={(event) => {
                field.onChange(event.currentTarget.value as FieldPathValue<TFieldValues, TName>);
              }}
              {...omitUndefined({ placeholder, required, step, testId })}
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
      {...omitUndefined({ rules })}
      render={({ field, fieldState }) => (
        <FormItem>
          <TimeInput
            {...timeProps}
            {...omitUndefined({ error: fieldState.error?.message, helperText: description })}
            id={String(name)}
            label={label}
            onChange={(value) => field.onChange(value ?? null)}
            {...omitUndefined({
              required,
              testId,
              value: typeof field.value === "string" ? field.value : undefined,
            })}
          />
        </FormItem>
      )}
    />
  );
}

function FormTimezoneField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  deviceTimeZone,
  description,
  disabled,
  label,
  name,
  placeholder = "Select a timezone",
  required,
  rules,
  testId,
}: FormTimezoneFieldProps<TFieldValues, TName>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { isSubmitting } = useFormState({ control });
  const currentValue = useWatch({ control, name });
  const options = getTimezoneOptions(
    typeof currentValue === "string" ? currentValue : null,
    deviceTimeZone,
  );

  return (
    <FormField
      control={control}
      name={name}
      {...(rules ? { rules } : {})}
      render={({ field }) => {
        const isDisabled = disabled || field.disabled || isSubmitting;
        return (
          <FormItem>
            <FormLabel>
              {label}
              {required ? " *" : null}
            </FormLabel>
            <Popover.Root
              open={open && !isDisabled}
              onOpenChange={(next) => {
                setOpen(next);
                setSearch("");
                if (!next) field.onBlur();
              }}
            >
              <Popover.Trigger asChild>
                <FormControl>
                  <Button
                    ref={field.ref}
                    type="button"
                    variant="outline"
                    disabled={isDisabled}
                    aria-label={label}
                    aria-expanded={open}
                    {...(testId === undefined ? {} : { testId })}
                  >
                    {options.find((option) => option.value === currentValue)?.label ??
                      currentValue ??
                      placeholder}
                  </Button>
                </FormControl>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  aria-label={label}
                  align="start"
                  sideOffset={4}
                  className="z-50 w-80 rounded-md border bg-popover p-1 shadow-md"
                >
                  <Command
                    label="Search timezones"
                    filter={(value, query, keywords) =>
                      filterTimezoneOptions(
                        [
                          {
                            value: value === "not-set" ? "" : value,
                            label: keywords?.[0] ?? value,
                          },
                        ],
                        query,
                      ).length > 0
                        ? 1
                        : 0
                    }
                  >
                    <CommandInput
                      aria-label="Search timezones"
                      placeholder="Search timezones"
                      value={search}
                      onValueChange={setSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No timezones found</CommandEmpty>
                      {/* Keep items registered; cmdk filters without repeatedly unregistering the catalog. */}
                      {options.map((option) => (
                        <CommandItem
                          key={option.value}
                          value={option.value || "not-set"}
                          keywords={[option.label]}
                          disabled={isDisabled}
                          onSelect={() => {
                            if (isDisabled) return;
                            field.onChange(option.value || null);
                            field.onBlur();
                            setOpen(false);
                            setSearch("");
                          }}
                        >
                          {option.label}
                          {(currentValue ?? "") === option.value ? " ✓" : ""}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            <input
              name={field.name}
              type="hidden"
              value={typeof field.value === "string" ? field.value : ""}
            />
            {description ? <FormDescription>{description}</FormDescription> : null}
            <FormMessage />
          </FormItem>
        );
      }}
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
  const { isSubmitting } = useFormState({ control });
  const resetKey = useFormDraftResetKey(control);
  return (
    <FormField
      control={control}
      name={name}
      {...omitUndefined({ rules })}
      render={({ field, fieldState }) => (
        <DurationInput
          {...durationProps}
          ref={field.ref}
          formControl={control}
          fieldName={field.name}
          resetKey={resetKey}
          disabled={disabled || field.disabled || isSubmitting}
          {...omitUndefined({ error: fieldState.error?.message, helperText: description })}
          id={String(name)}
          label={label}
          name={field.name}
          onBlur={field.onBlur}
          onChange={(value) => field.onChange(value as FieldPathValue<TFieldValues, TName>)}
          {...omitUndefined({ required, testId })}
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
  const { isSubmitting } = useFormState({ control });
  const resetKey = useFormDraftResetKey(control);
  return (
    <FormField
      control={control}
      name={name}
      {...omitUndefined({ rules })}
      render={({ field, fieldState }) => (
        <PaceInput
          {...paceProps}
          ref={field.ref}
          formControl={control}
          fieldName={field.name}
          resetKey={resetKey}
          disabled={disabled || field.disabled || isSubmitting}
          {...omitUndefined({ error: fieldState.error?.message, helperText: description })}
          id={String(name)}
          label={label}
          name={field.name}
          onBlur={field.onBlur}
          onChange={(value) => field.onChange(value as FieldPathValue<TFieldValues, TName>)}
          {...omitUndefined({ required, testId })}
          value={typeof field.value === "string" ? field.value : ""}
        />
      )}
    />
  );
}

function formatPercentFieldValue(value: unknown, valueMode: "percent" | "fraction") {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return valueMode === "fraction" ? value * 100 : value;
}

function parsePercentFieldValue(value: number, valueMode: "percent" | "fraction") {
  return valueMode === "fraction" ? value / 100 : value;
}

function FormPercentSliderField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  decimals,
  emptyValue,
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
  const { isSubmitting } = useFormState({ control });
  const resetKey = useFormDraftResetKey(control);
  return (
    <FormField
      control={control}
      name={name}
      {...omitUndefined({ rules })}
      render={({ field, fieldState }) => (
        <PercentSliderInput
          {...percentProps}
          ref={field.ref}
          formControl={control}
          fieldName={field.name}
          resetKey={resetKey}
          onBlur={field.onBlur}
          {...omitUndefined({ decimals })}
          disabled={disabled || field.disabled || isSubmitting}
          {...omitUndefined({ error: fieldState.error?.message, helperText: description })}
          id={String(name)}
          label={label}
          onChange={() => undefined}
          onInputResult={(result) =>
            field.onChange(
              result.status === "valid"
                ? parsePercentFieldValue(result.value, valueMode)
                : result.status === "empty"
                  ? emptyValue
                  : Number.NaN,
            )
          }
          {...omitUndefined({ required, testId })}
          value={formatPercentFieldValue(field.value, valueMode) ?? null}
        />
      )}
    />
  );
}

function FormWeightInputField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>(props: FormWeightInputFieldProps<TFieldValues, TName>) {
  const { control, description, emptyValue, label, name, required, rules, testId, ...weightProps } =
    props;
  const resetKey = useFormDraftResetKey(control);
  const { isSubmitting } = useFormState({ control });
  return (
    <FormField
      control={control}
      name={name}
      {...omitUndefined({ rules })}
      render={({ field, fieldState }) => (
        <WeightInputField
          {...weightProps}
          ref={field.ref}
          formControl={control}
          fieldName={field.name}
          onBlur={field.onBlur}
          disabled={weightProps.disabled || field.disabled || isSubmitting}
          onInputResult={(result) => {
            if (result.status === "invalid") field.onChange(Number.NaN);
          }}
          resetKey={`${weightProps.resetKey ?? ""}:${resetKey}`}
          {...omitUndefined({ error: fieldState.error?.message, helperText: description })}
          id={String(name)}
          label={label}
          onChangeKg={(value) =>
            field.onChange(value === null ? ("emptyValue" in props ? emptyValue : null) : value)
          }
          {...omitUndefined({ required, testId })}
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
  FormTimezoneField,
  FormWeightInputField,
};
