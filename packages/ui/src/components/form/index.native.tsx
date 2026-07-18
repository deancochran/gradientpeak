import * as React from "react";
import {
  Controller,
  type FieldPath,
  type FieldValues,
  FormProvider,
  useFormContext,
  useFormState,
} from "react-hook-form";
import { type AccessibilityProps, type TextProps, View, type ViewProps } from "react-native";

import { cn } from "../../lib/cn";
import { Text } from "../text/index.native";
import type { FormFieldContextValue, FormFieldProps, FormItemContextValue } from "./shared";

const Form = FormProvider;

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

const FormItemContext = React.createContext<FormItemContextValue | null>(null);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: FormFieldProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const formContext = useFormContext();
  const formState = useFormState(fieldContext?.name ? { name: fieldContext.name } : undefined);

  if (!formContext) {
    throw new Error("useFormField should be used within <Form>");
  }

  if (!fieldContext?.name) {
    throw new Error("useFormField should be used within <FormField>");
  }

  if (!itemContext?.id) {
    throw new Error("useFormField should be used within <FormItem>");
  }

  const { getFieldState } = formContext;
  const fieldState = getFieldState(fieldContext.name, formState);

  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formDescriptionId: `${id}-form-item-description`,
    formItemId: `${id}-form-item`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

type FormItemProps = ViewProps & {
  children: React.ReactNode;
};

function FormItem({ className, ...props }: FormItemProps) {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <View className={cn("gap-2", className)} {...props} />
    </FormItemContext.Provider>
  );
}

type FormLabelProps = Omit<TextProps, "className"> & {
  children: React.ReactNode;
  className?: string;
};

function FormLabel({ className, ...props }: FormLabelProps) {
  const { error, formItemId } = useFormField();

  return (
    <Text
      className={cn("text-sm font-medium text-foreground", error && "text-destructive", className)}
      nativeID={formItemId}
      {...props}
    />
  );
}

type FormControlProps = {
  children: React.ReactElement<AccessibilityProps>;
};

function FormControl({ children }: FormControlProps) {
  const { error, formItemId } = useFormField();
  const childProps = children.props;
  const validationHint = error?.message ? `Invalid: ${String(error.message)}` : null;

  const enhancedProps: AccessibilityProps = {
    ...childProps,
    accessibilityLabelledBy: childProps.accessibilityLabelledBy ?? formItemId,
    ...(validationHint
      ? {
          accessibilityHint: childProps.accessibilityHint
            ? `${childProps.accessibilityHint} ${validationHint}`
            : validationHint,
        }
      : {}),
  };

  return React.cloneElement(children, enhancedProps);
}

type FormDescriptionProps = Omit<TextProps, "className"> & {
  children: React.ReactNode;
  className?: string;
};

function FormDescription({ className, ...props }: FormDescriptionProps) {
  const { formDescriptionId } = useFormField();

  return (
    <Text
      className={cn("text-sm text-muted-foreground", className)}
      nativeID={formDescriptionId}
      {...props}
    />
  );
}

type FormMessageProps = Omit<TextProps, "className"> & {
  children?: React.ReactNode;
  className?: string;
};

function FormMessage({
  accessibilityLiveRegion,
  accessibilityRole,
  className,
  children,
  ...props
}: FormMessageProps) {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message ?? "") : children;

  if (!body) {
    return null;
  }

  return (
    <Text
      accessibilityLiveRegion={accessibilityLiveRegion ?? "assertive"}
      accessibilityRole={accessibilityRole ?? "alert"}
      className={cn("text-sm font-medium text-destructive", className)}
      nativeID={formMessageId}
      {...props}
    >
      {body}
    </Text>
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
} from "../form-fields/index.native";
export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
};
