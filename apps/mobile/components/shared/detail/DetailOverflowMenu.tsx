import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Ellipsis } from "lucide-react-native";
import { View } from "react-native";

export type DetailOverflowMenuAction = {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  testID: string;
  variant?: "default" | "destructive";
};

type DetailOverflowMenuProps = {
  actions: DetailOverflowMenuAction[];
  testID: string;
};

export function DetailOverflowMenu({ actions, testID }: DetailOverflowMenuProps) {
  const visibleActions = actions.filter(Boolean);

  if (visibleActions.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger testID={testID}>
        <View className="rounded-full p-2">
          <Icon as={Ellipsis} size={18} className="text-foreground" />
        </View>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6}>
        {visibleActions.map((action) => (
          <DropdownMenuItem
            key={action.testID}
            disabled={action.disabled}
            onPress={action.onPress}
            testID={action.testID}
            variant={action.variant}
          >
            <Text>{action.label}</Text>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
