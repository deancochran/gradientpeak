import type { ActivityDisplayModel, PlanningLedger } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { Info } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { GoalCard } from "@/components/shared/GoalCard";
import { IntensityDistributionChart } from "./IntensityDistributionChart";
import { LedgerEntries } from "./LedgerEntries";
import { LedgerLoadHero } from "./LedgerLoadHero";
import { PlanningLedgerDiagnosticsSheet } from "./PlanningLedgerDiagnosticsSheet";
import {
  buildPlanningLedgerPresentation,
  type TrainingComposition,
} from "./planningLedgerPresentation";
import { TrainingCompositionSummary } from "./TrainingCompositionSummary";
import { TrainingStateContextChart } from "./TrainingStateContextChart";
import { WeeklyLoadChart } from "./WeeklyLoadChart";

type NavigationTarget = NonNullable<PlanningLedger["entries"][number]["navigation"]>;

function Section({
  children,
  description,
  testID,
  title,
}: React.PropsWithChildren<{ description?: string; testID?: string; title: string }>) {
  return (
    <View className="gap-3" testID={testID}>
      <View className="gap-0.5">
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
          {title}
        </Text>
        {description ? <Text className="text-xs text-muted-foreground">{description}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function PlanningLedgerView({
  completedActivities,
  ledger,
  onOpenEntry,
  trainingComposition,
}: {
  completedActivities: readonly ActivityDisplayModel[];
  ledger: PlanningLedger;
  onOpenEntry: (target: NavigationTarget) => void;
  trainingComposition?: TrainingComposition | null;
}) {
  const presentation = useMemo(
    () => buildPlanningLedgerPresentation(ledger, trainingComposition),
    [ledger, trainingComposition],
  );
  const initialSelectedDate =
    presentation.days.find((day) => day.date === ledger.anchorDate)?.date ??
    presentation.days[0]?.date ??
    null;
  const [selectedDate, setSelectedDate] = useState<string | null>(initialSelectedDate);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  useEffect(() => {
    setSelectedDate(
      presentation.days.find((day) => day.date === ledger.anchorDate)?.date ??
        presentation.days[0]?.date ??
        null,
    );
  }, [ledger.anchorDate, presentation.days]);

  const resourceEntries = ledger.entries.filter(
    (entry) =>
      entry.kind === "planned" ||
      entry.kind === "event" ||
      entry.kind === "group_event" ||
      entry.kind === "completed",
  );
  const visibleResourceEntries =
    ledger.period === "day" || selectedDate === null
      ? resourceEntries
      : resourceEntries.filter((entry) => entry.date === selectedDate);

  return (
    <View className="gap-7 px-4 pb-8 pt-4" testID="planning-ledger-content">
      <View className="gap-0.5">
        <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
          {presentation.periodLabel}
        </Text>
        <Text className="text-sm text-muted-foreground">
          {ledger.period === "day" ? "Daily training breakdown" : "Weekly training breakdown"}
        </Text>
      </View>

      <LedgerLoadHero load={presentation.load} />

      {ledger.period === "week" ? (
        <Section
          description="Tap a bar or day to review its load and activities."
          testID="planning-ledger-daily-breakdown"
          title="This week"
        >
          <WeeklyLoadChart
            days={presentation.days}
            onSelectDate={setSelectedDate}
            selectedDate={selectedDate}
          />
        </Section>
      ) : null}

      <TrainingStateContextChart state={presentation.state} />

      <Section
        description="Completed and planned time by discipline."
        testID="planning-ledger-training-composition"
        title="Duration composition"
      >
        <TrainingCompositionSummary composition={presentation.durationComposition} />
      </Section>

      <IntensityDistributionChart intensity={presentation.intensity} />

      <Section
        description={
          ledger.period === "week"
            ? "Planned and completed work for the selected day."
            : "Planned and completed work for this day."
        }
        testID="planning-ledger-entries"
        title={ledger.period === "day" ? "Activities" : "Selected day"}
      >
        <LedgerEntries
          completedActivities={completedActivities}
          entries={visibleResourceEntries}
          onOpenEntry={onOpenEntry}
          period={ledger.period}
        />
      </Section>

      {ledger.milestones.length ? (
        <Section title="Goals and milestones" testID="planning-ledger-milestones">
          {ledger.milestones.map((milestone) => (
            <GoalCard
              goal={{
                id: milestone.id,
                targetDate: milestone.date,
                title: milestone.label,
                typeLabel: milestone.activityCategory ?? "Goal",
              }}
              key={milestone.id}
              onPress={() => onOpenEntry({ id: milestone.id, target: "goal" })}
              testID={`planning-ledger-milestone-${milestone.id}`}
              variant="compact"
            />
          ))}
        </Section>
      ) : null}

      <TouchableOpacity
        accessibilityLabel="Open calculation and source details"
        accessibilityRole="button"
        className="min-h-11 flex-row items-center justify-center gap-2 border-t border-border pt-4"
        onPress={() => setDiagnosticsOpen(true)}
        testID="planning-ledger-data-details-trigger"
      >
        <Info className="text-muted-foreground" size={16} />
        <Text className="text-sm font-medium text-muted-foreground">About these numbers</Text>
      </TouchableOpacity>

      <PlanningLedgerDiagnosticsSheet
        diagnostics={presentation.diagnostics}
        onClose={() => setDiagnosticsOpen(false)}
        visible={diagnosticsOpen}
      />
    </View>
  );
}
