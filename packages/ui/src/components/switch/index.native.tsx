import { getNativeTestProps } from "../../lib/test-props";
import { Switch as RegistrySwitch } from "../../registry/native/switch";
import { SWITCH_NATIVE_MINIMUM_HIT_SLOP, type SwitchTestProps } from "./shared";

type SwitchProps = Omit<React.ComponentProps<typeof RegistrySwitch>, "nativeID" | "testID"> &
  SwitchTestProps;

function Switch({ accessibilityLabel, id, role, testId, ...props }: SwitchProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  });

  return (
    <RegistrySwitch
      hitSlop={props.hitSlop ?? SWITCH_NATIVE_MINIMUM_HIT_SLOP}
      {...nativeTestProps}
      {...props}
    />
  );
}

export type { SwitchProps };
export { Switch };
