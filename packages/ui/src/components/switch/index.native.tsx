import { Switch as RegistrySwitch } from "../../registry/native/switch";
import { getNativeTestProps } from "../../lib/test-props";
import type { SwitchTestProps } from "./shared";

type SwitchProps = Omit<React.ComponentProps<typeof RegistrySwitch>, "nativeID" | "testID"> &
  SwitchTestProps;

function Switch({ accessibilityLabel, id, role, testId, ...props }: SwitchProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  });

  return <RegistrySwitch {...nativeTestProps} {...props} />;
}

export type { SwitchProps };
export { Switch };
