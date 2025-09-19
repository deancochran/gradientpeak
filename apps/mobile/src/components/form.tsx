import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import * as React from "react";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import type { TextProps } from "react-native";
import { View, type ViewProps } from "react-native";

// Form component - wrapper around react-hook-form's FormProvider
const Form = FormProvider;

// Form Field Context
type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue,
);

// FormField Component - Controlled form field with shadcn/ui pattern
const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

// Form Item Context
type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue,
);

// useFormField Hook - provides form field state and accessibility attributes
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
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

// FormItem Component - Container for form field components
interface FormItemProps extends ViewProps {
  children: React.ReactNode;
}

function FormItem({ className, ...props }: FormItemProps) {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <View className={cn("gap-2", className)} {...props} />
    </FormItemContext.Provider>
  );
}

// FormLabel Component - Accessible label for form fields
interface FormLabelProps extends Omit<TextProps, "className"> {
  children: React.ReactNode;
  className?: string;
}

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

// FormControl Component - Wrapper for form input components
interface FormControlProps {
  children: React.ReactElement;
}

function FormControl({ children, ...props }: FormControlProps) {
  const { error, formItemId, formDescriptionId, formMessageId } =
    useFormField();

  return React.cloneElement(children, {
    ...(children.props as object),
    "aria-labelledby": formItemId,
    "aria-describedby": error
      ? `${formDescriptionId} ${formMessageId}`
      : formDescriptionId,
    "aria-invalid": !!error,
    accessibilityLabel:
      (children.props as any)?.accessibilityLabel || formItemId,
    accessibilityInvalid: !!error,
    ...props,
  });
}

// FormDescription Component - Helper text for form fields
interface FormDescriptionProps extends Omit<TextProps, "className"> {
  children: React.ReactNode;
  className?: string;
}

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

// FormMessage Component - Displays validation error messages
interface FormMessageProps extends Omit<TextProps, "className"> {
  children?: React.ReactNode;
  className?: string;
}

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
