import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Ellipsis, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, View } from "react-native";

export type DetailOverflowMenuAction = {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  testID: string;
  variant?: "default" | "destructive";
};

type DetailOverflowMenuProps = {
  accessibilityLabel?: string;
  actions: DetailOverflowMenuAction[];
  testID: string;
};

export function DetailOverflowMenu({
  accessibilityLabel = "Open actions menu",
  actions,
  testID,
}: DetailOverflowMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);
  const visibleActions = actions.filter(Boolean);

  useEffect(() => {
    if (isOpen || !pendingActionRef.current) {
      return;
    }

    const pendingAction = pendingActionRef.current;
    pendingActionRef.current = null;
    pendingAction();
  }, [isOpen]);

  if (visibleActions.length === 0) {
    return null;
  }

  const closeMenu = () => setIsOpen(false);

  const handleActionPress = (action: DetailOverflowMenuAction) => {
    if (action.disabled) {
      return;
    }

    pendingActionRef.current = action.onPress;
    setIsOpen(false);
  };

  return (
    <>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        className="min-h-11 min-w-11 items-center justify-center rounded-full"
        onPress={() => setIsOpen(true)}
        testID={testID}
      >
        <Icon as={Ellipsis} size={18} className="text-foreground" />
      </Pressable>

      {isOpen ? (
        <Modal
          accessibilityViewIsModal
          animationType="fade"
          onRequestClose={closeMenu}
          transparent
          visible
          testID={`${testID}-menu`}
        >
          <View className="flex-1 justify-end">
            <Pressable
              accessibilityElementsHidden
              className="absolute inset-0 bg-black/50"
              importantForAccessibility="no-hide-descendants"
              onPress={closeMenu}
              testID={`${testID}-backdrop`}
            />
            <View className="rounded-t-3xl bg-background px-4 pb-6 pt-3">
              <View className="mb-2 flex-row items-center justify-between">
                <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
                  Actions
                </Text>
                <Pressable
                  accessibilityLabel="Close actions menu"
                  accessibilityRole="button"
                  className="min-h-11 min-w-11 items-center justify-center rounded-full"
                  onPress={closeMenu}
                  testID={`${testID}-close`}
                >
                  <Icon as={X} size={20} className="text-muted-foreground" />
                </Pressable>
              </View>

              {visibleActions.map((action) => (
                <Pressable
                  accessibilityLabel={action.label}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: action.disabled ?? false }}
                  className={`min-h-11 justify-center rounded-xl px-4 py-3 ${
                    action.disabled ? "opacity-50" : ""
                  }`}
                  disabled={action.disabled}
                  key={action.testID}
                  onPress={() => handleActionPress(action)}
                  testID={action.testID}
                >
                  <Text
                    className={
                      action.variant === "destructive"
                        ? "font-medium text-destructive"
                        : "font-medium text-foreground"
                    }
                  >
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}
