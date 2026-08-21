import { GoalCard } from "@/components/shared/GoalCard";

export function GoalAgendaCard({ onPress, title }: { onPress: () => void; title: string }) {
  return (
    <GoalCard
      goal={{ id: "calendar-day-goal", title }}
      onPress={onPress}
      testID="calendar-day-goal-anchor"
    />
  );
}
