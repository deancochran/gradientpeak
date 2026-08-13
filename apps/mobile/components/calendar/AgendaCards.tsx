import { Text } from "@repo/ui/components/text";
import { Pressable } from "react-native";

export function GoalAgendaCard({ onPress, title }: { onPress: () => void; title: string }) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-3xl border border-primary/20 bg-primary/5 px-4 py-4"
      testID="calendar-day-goal-anchor"
    >
      <Text className="text-xs font-semibold uppercase tracking-wide text-primary">Goal</Text>
      <Text className="mt-2 text-xl font-semibold text-foreground">{title}</Text>
      <Text className="mt-1 text-sm text-muted-foreground">Target day on your timeline.</Text>
    </Pressable>
  );
}
