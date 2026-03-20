import * as React from "react";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { View, type TextProps, type ViewProps } from "react-native";

import { cn } from "../../lib/cn";
import { Text } from "../text/index.native";
import type {
  FormFieldContextValue,
  FormFieldProps,
  FormItemContextValue,
} from "./shared";

const Form = FormProvider;

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue,
);

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue,
);

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
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>");
  }

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
      className={cn(
        "text-sm font-medium text-foreground",
        error && "text-destructive",
        className,
      )}
      nativeID={formItemId}
      {...props}
    />
  );
}

type FormControlProps = {
  children: React.ReactElement;
};

function FormControl({ children }: FormControlProps) {
  const { error, formItemId } = useFormField();

  const enhancedProps: Record<string, unknown> = {
    ...(children.props as Record<string, unknown>),
    accessibilityInvalid: !!error,
    accessibilityLabel:
      (children.props as Record<string, unknown>)?.accessibilityLabel ||
      formItemId,
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

function FormMessage({ className, children, ...props }: FormMessageProps) {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message ?? "") : children;

  if (!body) {
    return null;
  }

  return (
    <Text
      className={cn("text-sm font-medium text-destructive", className)}
      nativeID={formMessageId}
      {...props}
    >
      {body}
    </Text>
  );
}

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
