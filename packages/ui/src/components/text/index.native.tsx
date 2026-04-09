import * as React from "react";
import { getNativeTestProps } from "../../lib/test-props";
import { Text as RegistryText, TextClassContext } from "../../registry/native/text";
import type { TextTestProps, TextVariant, TextVariantProps } from "./shared";

type TextProps = React.ComponentProps<typeof RegistryText> &
  TextVariantProps & {
    asChild?: boolean;
  } & TextTestProps;

function Text({ accessibilityLabel, id, nativeID, testId, testID, ...props }: TextProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    testId,
  });

  return (
    <RegistryText
      {...nativeTestProps}
      nativeID={nativeID ?? nativeTestProps.nativeID}
      testID={testID ?? nativeTestProps.testID}
      {...props}
    />
  );
}

export type { TextProps, TextVariant, TextVariantProps };
export { Text, TextClassContext };
