import { cn } from "@/lib/utils";
import * as SwitchPrimitives from "@rn-primitives/switch";
import { Platform } from "react-native";

const nativeMinimumHitSlop = { top: 13, bottom: 13, left: 6, right: 6 };

function Switch({
  className,
  accessibilityState,
  hitSlop,
  ...props
}: SwitchPrimitives.RootProps & React.RefAttributes<SwitchPrimitives.RootRef>) {
  return (
    <SwitchPrimitives.Root
      accessibilityRole="switch"
      accessibilityState={{
        ...accessibilityState,
        checked: Boolean(props.checked),
        disabled: Boolean(props.disabled),
      }}
      hitSlop={
        hitSlop ?? (Platform.OS === "web" ? undefined : nativeMinimumHitSlop)
      }
      className={cn(
        "flex h-[1.15rem] w-8 shrink-0 flex-row items-center rounded-full border border-transparent shadow-sm shadow-black/5",
        Platform.select({
          web: "focus-visible:border-ring focus-visible:ring-ring/50 peer inline-flex outline-none transition-all focus-visible:ring-[3px] disabled:cursor-not-allowed",
        }),
        props.checked ? "bg-primary" : "bg-input dark:bg-input/80",
        props.disabled && "opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "bg-background size-4 rounded-full transition-transform",
          Platform.select({
            web: "pointer-events-none block ring-0",
          }),
          props.checked
            ? "dark:bg-primary-foreground translate-x-3.5"
            : "dark:bg-foreground translate-x-0",
        )}
      />
    </SwitchPrimitives.Root>
  );
}

export { Switch };
