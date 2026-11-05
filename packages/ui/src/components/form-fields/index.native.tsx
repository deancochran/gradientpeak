import { useEffect, useState } from "react";
import {
  type Control,
  type ControllerRenderProps,
  type FieldPath,
  type FieldPathValue,
  type FieldValues,
  useFormState,
  useWatch,
} from "react-hook-form";
import { FlatList, View } from "react-native";
import { useFormDraftResetKey } from "../../hooks/pending-form-drafts";
import { cn } from "../../lib/cn";
import { BoundedNumberInput } from "../bounded-number-input/index.native";
import { Button } from "../button/index.native";
import { DateInput } from "../date-input/index.native";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "../dialog/index.native";
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
              {...omitUndefined({ error: fieldState.error?.message })}
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
                editable={!isDisabled}
                onBlur={field.onBlur}
                onChangeText={(nextValue) => {
                  field.onChange(
                    parseValue
                      ? parseValue(nextValue)
                      : (nextValue as FieldPathValue<TFieldValues, TName>),
                  );
                }}
                inputRef={field.ref}
                {...omitUndefined({ testId })}
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
          {...omitUndefined({ accessibilityHint: accessibilityHint || undefined })}
          accessibilityLabel={label}
          accessibilityState={{ disabled: isDisabled }}
          editable={!isDisabled}
          keyboardType={allowDecimal ? "decimal-pad" : "numeric"}
          onBlur={input.blur}
          onChangeText={input.change}
          {...omitUndefined({ placeholder, testId })}
          inputRef={field.ref}
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
        <FormItem className={cn("flex-row items-center justify-between gap-4 py-2", className)}>
          <View className="flex-1 gap-0.5">
            <FormLabel>{label}</FormLabel>
            {description ? <FormDescription>{description}</FormDescription> : null}
            <FormMessage />
          </View>
          <FormControl>
            <Switch
              accessibilityLabel={switchLabel ?? label}
              checked={Boolean(field.value)}
              {...omitUndefined({ disabled, testId })}
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
  numberOfLines,
  parseValue,
  placeholder,
  required,
  rules,
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
                editable={!isDisabled}
                {...omitUndefined({ numberOfLines })}
                onBlur={field.onBlur}
                onChangeText={(nextValue) => {
                  field.onChange(
                    parseValue
                      ? parseValue(nextValue)
                      : (nextValue as FieldPathValue<TFieldValues, TName>),
                  );
                }}
                {...omitUndefined({ placeholder, testId })}
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
              {...omitUndefined({ disabled })}
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
              {...omitUndefined({
                value:
                  selectedValue == null
                    ? undefined
                    : ({
                        label:
                          options.find((option) => option.value === selectedValue)?.label ??
                          selectedValue,
                        value: selectedValue,
                      } as never),
              })}
            >
              <FormControl>
                <SelectTrigger
                  {...omitUndefined({
                    accessibilityHint:
                      [required ? "Required" : undefined, description].filter(Boolean).join(". ") ||
                      undefined,
                    testID: testId,
                  })}
                  accessibilityLabel={label}
                  accessibilityState={{ disabled }}
                  {...omitUndefined({ "aria-required": required })}
                >
                  <SelectValue placeholder={placeholder ?? ""} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem
                    key={option.value}
                    {...omitUndefined({ disabled: option.disabled })}
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
              <View className="flex-row flex-wrap gap-2" testID={testId}>
                {options.map((option) => {
                  const selected = option.value === selectedValue;

                  return (
                    <Button
                      accessibilityRole="button"
                      accessibilityState={{
                        selected,
                        ...(disabled || option.disabled ? { disabled: true } : {}),
                      }}
                      className={options.length > 3 ? "min-w-[30%] flex-1" : "flex-1"}
                      {...omitUndefined({
                        disabled: disabled || option.disabled,
                        testId: testId ? `${testId}-${option.value}` : undefined,
                      })}
                      key={option.value}
                      onPress={() => {
                        field.onChange(
                          parseValue
                            ? parseValue(option.value)
                            : (option.value as FieldPathValue<TFieldValues, TName>),
                        );
                      }}
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
          formControl={control}
          ref={field.ref}
          onBlur={field.onBlur}
          resetKey={resetKey}
          disabled={disabled || field.disabled || isSubmitting}
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

  const localDate = new Date();
  const fallbackDate = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")}`;
  return `${date ?? fallbackDate}T${time ?? "00:00"}`;
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
      {...omitUndefined({ rules })}
      render={({ field, fieldState }) => {
        const { date, time } = splitDateTimeValue(field.value);

        return (
          <View pointerEvents={disabled ? "none" : "auto"} className="gap-3 opacity-100">
            <View className="gap-3 sm:flex-row">
              <DateInput
                {...omitUndefined({
                  disabled,
                  error: fieldState.error?.message,
                  helperText: description,
                })}
                id={`${String(name)}-date`}
                label={dateLabel ?? `${label} date`}
                onChange={(nextDate) => {
                  field.onChange(
                    combineDateTimeValue(nextDate, time) as FieldPathValue<TFieldValues, TName>,
                  );
                }}
                pickerPresentation="modal"
                {...omitUndefined({
                  required,
                  testId: testId ? `${testId}-date` : undefined,
                  value: date,
                })}
              />
              <TimeInput
                {...omitUndefined({ disabled, error: fieldState.error?.message })}
                id={`${String(name)}-time`}
                label={timeLabel ?? `${label} time`}
                onChange={(nextTime) => {
                  field.onChange(
                    combineDateTimeValue(date, nextTime) as FieldPathValue<TFieldValues, TName>,
                  );
                }}
                pickerPresentation="modal"
                {...omitUndefined({
                  required,
                  testId: testId ? `${testId}-time` : undefined,
                  value: time,
                })}
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
      {...omitUndefined({ rules })}
      render={({ field, fieldState }) => (
        <TimeInput
          {...timeProps}
          {...omitUndefined({
            disabled,
            error: fieldState.error?.message,
            helperText: description,
          })}
          id={String(name)}
          label={label}
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
  useEffect(() => {
    if (disabled || isSubmitting) {
      setOpen(false);
      setSearch("");
    }
  }, [disabled, isSubmitting]);
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
            <Dialog
              open={open && !isDisabled}
              onOpenChange={(next) => {
                setOpen(next);
                setSearch("");
                if (!next) field.onBlur();
              }}
            >
              <DialogTrigger asChild>
                <FormControl>
                  <Button
                    ref={field.ref}
                    variant="outline"
                    disabled={isDisabled}
                    accessibilityLabel={label}
                    accessibilityState={{ expanded: open && !isDisabled, disabled: isDisabled }}
                    {...(testId === undefined ? {} : { testId })}
                  >
                    <Text>
                      {options.find((option) => option.value === currentValue)?.label ??
                        currentValue ??
                        placeholder}
                    </Text>
                  </Button>
                </FormControl>
              </DialogTrigger>
              <DialogContent className="w-80 gap-2">
                <DialogTitle>{label}</DialogTitle>
                <Input
                  accessibilityLabel="Search timezones"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Search timezones"
                  value={search}
                  onChangeText={setSearch}
                />
                <FlatList
                  style={{ height: 240 }}
                  data={filterTimezoneOptions(options, search)}
                  extraData={currentValue}
                  keyboardShouldPersistTaps="handled"
                  keyExtractor={(item) => item.value}
                  ListEmptyComponent={<Text>No timezones found</Text>}
                  renderItem={({ item }) => (
                    <Button
                      variant="ghost"
                      className="justify-start"
                      disabled={isDisabled}
                      accessibilityLabel={item.label}
                      accessibilityState={{ selected: (currentValue ?? "") === item.value }}
                      onPress={() => {
                        if (isDisabled) return;
                        field.onChange(item.value || null);
                        field.onBlur();
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      <Text>{item.label}</Text>
                    </Button>
                  )}
                />
              </DialogContent>
            </Dialog>
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
