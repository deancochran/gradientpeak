import { ProgressBar } from "@repo/ui/components/progress";
import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import type { PlanningLedgerPresentation } from "./planningLedgerPresentation";

export function LedgerLoadHero({ load }: { load: PlanningLedgerPresentation["load"] }) {
  const comparison =
    load.completed !== null && load.planned !== null
      ? `${load.completedLabel} of ${load.plannedLabel} planned`
      : load.completed !== null
        ? `${load.completedLabel} completed`
        : load.planned !== null
          ? `${load.plannedLabel} planned`
          : "No load value is available";

  return (
    <View
      accessible
      accessibilityLabel={`${load.title}. ${comparison}.`}
      className="gap-4 rounded-3xl bg-primary p-5"
      testID="planning-ledger-load-hero"
    >
      <View className="gap-1">
        <Text className="text-sm font-medium text-primary-foreground/80">Training load</Text>
        <View className="flex-row items-baseline gap-2">
          <Text className="text-4xl font-bold text-primary-foreground">{load.completedLabel}</Text>
          {load.completed !== null ? (
            <Text className="text-sm font-medium text-primary-foreground/80">completed</Text>
          ) : null}
        </View>
        <Text className="text-base font-semibold text-primary-foreground">{load.title}</Text>
        <Text className="text-sm text-primary-foreground/80">{comparison}</Text>
      </View>

      {load.progressPercent !== null ? (
        <View className="gap-1">
          <ProgressBar
            accessibilityLabel={`Load progress ${load.progressPercent} percent`}
            className="bg-primary-foreground/20"
            indicatorClassName="bg-primary-foreground"
            testId="planning-ledger-load-progress"
            value={load.progressPercent}
          />
          <Text className="text-xs text-primary-foreground/80">
            {load.progressPercent}% of plan{load.varianceLabel ? ` · ${load.varianceLabel}` : ""}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
