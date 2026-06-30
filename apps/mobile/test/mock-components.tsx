import React from "react";

export type HostProps = Record<string, unknown> & { children?: React.ReactNode };

export type PressableHostProps = HostProps & {
  disabled?: boolean;
  onPress?: () => void;
  testId?: string;
  testID?: string;
};

export type MockFormControl<TValues extends Record<string, string>> = {
  errors: Record<string, { message: string }>;
  setValue: (name: string, value: string) => void;
  values: TValues;
};

export type MockFormTextFieldProps<TValues extends Record<string, string>> = {
  control: MockFormControl<TValues>;
  name: keyof TValues & string;
  placeholder?: string;
  testId?: string;
};

export type ZodFormSubmitProps<TValues extends Record<string, string>> = {
  form: {
    handleSubmit: (onSubmit: (data: TValues) => unknown) => () => unknown;
  };
  onSubmit: (data: TValues) => unknown;
};

export function clearRecord(record: Record<string, unknown>) {
  for (const key of Object.keys(record)) {
    delete record[key];
  }
}

export function createHostComponent(type: string) {
  return function HostComponent({ children, ...props }: HostProps) {
    return React.createElement(type, props, children);
  };
}

export const createHost = createHostComponent;

export function createPressableHost(type = "Pressable") {
  return function PressableHost({
    children,
    disabled,
    onPress,
    testId,
    testID,
    ...props
  }: PressableHostProps) {
    return React.createElement(
      type,
      {
        ...props,
        disabled,
        onPress: disabled ? undefined : onPress,
        testID: testID ?? testId,
      },
      children,
    );
  };
}

export const createButtonComponent = createPressableHost;

export function createStackComponent() {
  function Stack({ children, ...props }: HostProps) {
    return React.createElement("Stack", props, children);
  }

  Stack.Screen = function StackScreen({
    children,
    name,
    options,
    ...props
  }: HostProps & { name?: string; options?: unknown }) {
    return React.createElement(
      "StackScreen",
      { ...props, name, options, testID: name ? `stack-screen-${name}` : undefined },
      children,
    );
  };

  return Stack;
}

export function createFormTextField<TValues extends Record<string, string>>() {
  return function MockFormTextField({
    control,
    name,
    placeholder,
    testId,
  }: MockFormTextFieldProps<TValues>) {
    return React.createElement(
      React.Fragment,
      null,
      React.createElement("TextInput", {
        onChangeText: (nextValue: string) => control.setValue(name, nextValue),
        placeholder,
        testID: testId ?? name,
        value: control.values[name] ?? "",
      }),
      control.errors[name] ? React.createElement("Text", null, control.errors[name].message) : null,
    );
  };
}

export function createFormComponentMocks() {
  return {
    __esModule: true,
    Form: ({ children }: { children?: React.ReactNode }) => children,
    FormBoundedNumberField: createHost("FormBoundedNumberField"),
    FormDateInputField: createHost("FormDateInputField"),
    FormField: createHost("FormField"),
    FormIntegerStepperField: createHost("FormIntegerStepperField"),
    FormNumberField: createHost("FormNumberField"),
    FormSegmentedSelectField: createHost("FormSegmentedSelectField"),
    FormSelectField: createHost("FormSelectField"),
    FormSwitchField: createHost("FormSwitchField"),
    FormTextField: createHost("FormTextField"),
    FormTextareaField: createHost("FormTextareaField"),
    FormTimeInputField: createHost("FormTimeInputField"),
  };
}
