import * as React from "react";
import { Platform, ScrollView } from "react-native";
import { cn } from "../../lib/cn";
import { getNativeTestProps } from "../../lib/test-props";
import type { Option } from "../../registry/native/select";
import {
  SelectTrigger as RegistrySelectTrigger,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectValue,
} from "../../registry/native/select";
import type { SelectTriggerSize } from "./shared";

function SelectTrigger({
  accessibilityLabel,
  id,
  nativeID,
  size = "default",
  testId,
  testID,
  ...props
}: React.ComponentProps<typeof RegistrySelectTrigger> & {
  accessibilityLabel?: string;
  id?: string;
  nativeID?: string;
  size?: SelectTriggerSize;
  testId?: string;
  testID?: string;
}) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    testId,
  });

  return (
    <RegistrySelectTrigger
      size={size}
      {...nativeTestProps}
      nativeID={nativeID ?? nativeTestProps.nativeID}
      testID={testID ?? nativeTestProps.testID}
      {...props}
    />
  );
}

function NativeSelectScrollView({ className, ...props }: React.ComponentProps<typeof ScrollView>) {
  if (Platform.OS === "web") {
    return <>{props.children as React.ReactNode}</>;
  }

  return <ScrollView className={cn("max-h-52", className)} {...props} />;
}

export type { Option };
export {
  NativeSelectScrollView,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
