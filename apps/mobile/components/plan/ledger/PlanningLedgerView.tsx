import type { PlanningLedger } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { TouchableOpacity, View } from "react-native";

type NavigationTarget = NonNullable<PlanningLedger["entries"][number]["navigation"]>;

function formatLoad(item: PlanningLedger["load"]["completed"]) {
  if (item.status === "unavailable" || item.value === null) return "Unavailable";
  return item.value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatPlannedLoad(item: PlanningLedger["load"]["planned"]) {
  if (item.status === "unavailable" || item.value === null) return "Unavailable";
  return item.value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatState(item: PlanningLedger["trainingState"]["actual"]["fitness"]) {
  if (item.status === "unavailable" || item.value === null) return "Unavailable";
  return item.value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function statusDetail(status: PlanningLedger["load"]["completed"]["status"]) {
  return status === "partial" ? "Partial" : undefined;
}

function formatDuration(item: PlanningLedger["contributingDurationSeconds"]) {
  if (item.status === "unavailable" || item.value === null) return "Unavailable";
  const minutes = item.value / 60;
  return `${minutes.toLocaleString(undefined, { maximumFractionDigits: 1 })} min`;
}

function formatIntensity(item: PlanningLedger["intensity"]) {
  if (item.status === "unavailable" || item.value === null) return "Unavailable";
  if (item.status === "known_zero") return "0.00";
  return item.value.toFixed(2);
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatAsOf(asOf: string, timezone: string | null) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(new Date(asOf));
  } catch {
    return asOf;
  }
}

function Section({
  children,
  testID,
  title,
}: React.PropsWithChildren<{ testID?: string; title: string }>) {
  return (
    <View className="gap-3 border-t border-border pt-4" testID={testID}>
      <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}

type InsightFact = {
  available: boolean;
  detail?: string;
  label: string;
  value: string;
};

function FactGrid({ emptyMessage, facts }: { emptyMessage: string; facts: InsightFact[] }) {
  const availableFacts = facts.filter((item) => item.available);
  const unavailableCount = facts.length - availableFacts.length;

  return (
    <View className="gap-2">
      {availableFacts.length ? (
        <View className="flex-row flex-wrap rounded-2xl border border-border bg-card px-2 py-2">
          {availableFacts.map((fact) => (
            <View
              accessible
              accessibilityLabel={`${fact.label}: ${fact.value}${fact.detail ? `. ${fact.detail}` : ""}`}
              className="w-1/2 px-2 py-2.5"
              key={fact.label}
            >
              <Text className="text-xs text-muted-foreground">{fact.label}</Text>
              <Text className="mt-0.5 text-lg font-semibold text-foreground">{fact.value}</Text>
              {fact.detail ? (
                <Text className="mt-0.5 text-[10px] text-muted-foreground">{fact.detail}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <Text className="rounded-xl bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
          {emptyMessage}
        </Text>
      )}
      {unavailableCount > 0 && availableFacts.length > 0 ? (
        <Text className="text-xs text-muted-foreground">
          {unavailableCount} additional {unavailableCount === 1 ? "metric is" : "metrics are"} not
          available for this period.
        </Text>
      ) : null}
    </View>
  );
}

function fact(label: string, value: string, available: boolean, detail?: string): InsightFact {
  return { available, label, value, ...(detail !== undefined ? { detail } : {}) };
}

function InsightSection({
  children,
  description,
  testID,
  title,
}: React.PropsWithChildren<{ description: string; testID: string; title: string }>) {
  return (
    <View className="gap-3" testID={testID}>
      <View className="gap-0.5">
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
          {title}
        </Text>
        <Text className="text-xs leading-4 text-muted-foreground">{description}</Text>
      </View>
      {children}
    </View>
  );
}

export function PlanningLedgerPerformanceInsights({
  ledger,
  showDataWarning = true,
}: {
  ledger: PlanningLedger;
  showDataWarning?: boolean;
}) {
  const dataDetailsFlag = getDataDetailsFlag(ledger);

  return (
    <View className="gap-5" testID="planning-ledger-performance-insights">
      {showDataWarning && dataDetailsFlag ? (
        <View
          accessibilityRole="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2"
          testID="planning-ledger-sheet-data-warning"
        >
          <Text className="text-sm font-medium text-foreground">{dataDetailsFlag}</Text>
          <Text className="mt-1 text-xs text-muted-foreground">
            Some values for this period may be incomplete.
          </Text>
        </View>
      ) : null}

      <InsightSection
        description="How completed and scheduled work affects this period."
        title="Training load"
        testID="planning-ledger-load"
      >
        <FactGrid
          emptyMessage="Training-load metrics are not available for this period."
          facts={[
            fact(
              "Completed",
              formatLoad(ledger.load.completed),
              ledger.load.completed.status !== "unavailable" &&
                ledger.load.completed.value !== null,
            ),
            fact(
              "Planned",
              formatPlannedLoad(ledger.load.planned),
              ledger.load.planned.status !== "unavailable" && ledger.load.planned.value !== null,
              statusDetail(ledger.load.planned.status),
            ),
            fact(
              "Remaining",
              formatPlannedLoad(ledger.load.remaining),
              ledger.load.remaining.status !== "unavailable" &&
                ledger.load.remaining.value !== null,
              statusDetail(ledger.load.remaining.status),
            ),
            fact(
              "Effective",
              formatLoad(ledger.load.effective),
              ledger.load.effective.status !== "unavailable" &&
                ledger.load.effective.value !== null,
            ),
            fact(
              "Intensity",
              formatIntensity(ledger.intensity),
              ledger.intensity.status !== "unavailable" && ledger.intensity.value !== null,
              statusDetail(ledger.intensity.status),
            ),
            fact(
              "Duration",
              formatDuration(ledger.contributingDurationSeconds),
              ledger.contributingDurationSeconds.status !== "unavailable" &&
                ledger.contributingDurationSeconds.value !== null,
              statusDetail(ledger.contributingDurationSeconds.status),
            ),
          ]}
        />
      </InsightSection>

      <InsightSection
        description="Actual state and the projected effect of scheduled work."
        title="Training state"
        testID="planning-ledger-training-state"
      >
        <FactGrid
          emptyMessage="Fitness and fatigue estimates are not available for this date."
          facts={[
            fact(
              "Actual fitness",
              formatState(ledger.trainingState.actual.fitness),
              ledger.trainingState.actual.fitness.status !== "unavailable" &&
                ledger.trainingState.actual.fitness.value !== null,
              ledger.trainingState.actual.fitness.observedOn
                ? `Actual · ${formatDate(ledger.trainingState.actual.fitness.observedOn)}`
                : undefined,
            ),
            fact(
              "Planned fitness projection",
              formatState(ledger.trainingState.planned.fitness),
              ledger.trainingState.planned.fitness.status !== "unavailable" &&
                ledger.trainingState.planned.fitness.value !== null,
              ledger.trainingState.planned.fitness.observedOn
                ? `Scheduled projection · ${formatDate(ledger.trainingState.planned.fitness.observedOn)}`
                : undefined,
            ),
            fact(
              "Actual fatigue",
              formatState(ledger.trainingState.actual.fatigue),
              ledger.trainingState.actual.fatigue.status !== "unavailable" &&
                ledger.trainingState.actual.fatigue.value !== null,
              ledger.trainingState.actual.fatigue.observedOn
                ? `Actual · ${formatDate(ledger.trainingState.actual.fatigue.observedOn)}`
                : undefined,
            ),
            fact(
              "Planned fatigue projection",
              formatState(ledger.trainingState.planned.fatigue),
              ledger.trainingState.planned.fatigue.status !== "unavailable" &&
                ledger.trainingState.planned.fatigue.value !== null,
              ledger.trainingState.planned.fatigue.observedOn
                ? `Scheduled projection · ${formatDate(ledger.trainingState.planned.fatigue.observedOn)}`
                : undefined,
            ),
          ]}
        />
      </InsightSection>
    </View>
  );
}

export function PlanningLedgerView({
  compact = false,
  ledger,
  onOpenEntry,
}: {
  compact?: boolean;
  ledger: PlanningLedger;
  onOpenEntry: (target: NavigationTarget) => void;
}) {
  const dataDetailsFlag = getDataDetailsFlag(ledger);
  const [dataDetailsOpen, setDataDetailsOpen] = useState(dataDetailsFlag !== null);
  const lastAutoOpenedFlagRef = useRef(dataDetailsFlag);

  useEffect(() => {
    if (dataDetailsFlag && dataDetailsFlag !== lastAutoOpenedFlagRef.current) {
      lastAutoOpenedFlagRef.current = dataDetailsFlag;
      setDataDetailsOpen(true);
    }
    if (!dataDetailsFlag) lastAutoOpenedFlagRef.current = null;
  }, [dataDetailsFlag]);
  const periodLabel =
    ledger.period === "day"
      ? formatDate(ledger.periodStart)
      : `${formatDate(ledger.periodStart)} – ${formatDate(ledger.periodEnd)}`;
  const sourceLabel = (source: PlanningLedger["sourceCoverage"]["activities"]) =>
    source
      ? `${source.status} · ${formatDate(source.startDate)} – ${formatDate(source.endDate)}`
      : "Unavailable";

  return (
    <View
      className={compact ? "gap-5 pb-4" : "gap-5 px-4 pb-8 pt-4"}
      testID="planning-ledger-content"
    >
      {!compact ? (
        <View className="gap-1">
          <Text accessibilityRole="header" className="text-2xl font-bold text-foreground">
            Planning ledger
          </Text>
          <Text className="text-sm font-medium text-foreground">{periodLabel}</Text>
          <Text className="text-xs text-muted-foreground">
            Timezone: {ledger.planningTimezone ?? "Unavailable"}
          </Text>
          <Text className="text-xs text-muted-foreground">
            As of {formatAsOf(ledger.asOf, ledger.planningTimezone)}
          </Text>
          <Text className="text-xs text-muted-foreground">Read-only period record</Text>
        </View>
      ) : null}

      <PlanningLedgerPerformanceInsights ledger={ledger} showDataWarning={compact} />

      {ledger.period !== "day" ? (
        <Section title="Daily breakdown" testID="planning-ledger-daily-breakdown">
          {ledger.dailyBreakdown.length ? (
            ledger.dailyBreakdown.map((day) => (
              <View className="gap-1 rounded-xl bg-muted/20 p-3" key={day.date}>
                <Text className="font-medium text-foreground">{formatDate(day.date)}</Text>
                <Text className="text-xs text-muted-foreground">
                  Completed {formatLoad(day.completed)} · Planned {formatPlannedLoad(day.planned)}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Remaining {formatPlannedLoad(day.remaining)} · Effective{" "}
                  {formatLoad(day.effective)} · Intensity {formatIntensity(day.intensity)}
                </Text>
              </View>
            ))
          ) : (
            <Text className="text-sm text-muted-foreground">No daily records are available.</Text>
          )}
        </Section>
      ) : null}

      <Section title="Chronological entries" testID="planning-ledger-entries">
        {ledger.entries.length ? (
          ledger.entries.map((entry) => {
            const loadLabel =
              entry.kind === "planned"
                ? ` · Load ${formatPlannedLoad(entry.load)}`
                : entry.load.status === "unavailable"
                  ? ""
                  : ` · Load ${formatLoad(entry.load)}${entry.load.status === "partial" ? " (partial)" : ""}`;
            const intensityLabel =
              entry.kind === "planned"
                ? ` · Intensity ${entry.intensity.status === "complete" && entry.intensity.value !== null ? formatIntensity(entry.intensity) : "0.00"}`
                : entry.intensity.status === "unavailable"
                  ? ""
                  : ` · Intensity ${formatIntensity(entry.intensity)}${entry.intensity.status === "partial" ? " (partial)" : ""}`;
            const durationLabel =
              entry.kind === "planned"
                ? ` · ${entry.contributingDurationSeconds.status === "complete" && entry.contributingDurationSeconds.value !== null ? formatDuration(entry.contributingDurationSeconds) : "0 min"}`
                : entry.contributingDurationSeconds.status === "unavailable"
                  ? ""
                  : ` · ${formatDuration(entry.contributingDurationSeconds)}${entry.contributingDurationSeconds.status === "partial" ? " (partial)" : ""}`;
            const content = (
              <>
                <Text className="font-medium text-foreground">{entry.title}</Text>
                <Text className="text-xs text-muted-foreground">
                  {formatDate(entry.date)} · {entry.status}
                  {loadLabel}
                  {intensityLabel}
                  {durationLabel}
                </Text>
              </>
            );
            return entry.navigation ? (
              <TouchableOpacity
                accessibilityHint={`Opens ${formatNavigationDestination(entry.navigation.target)} details`}
                accessibilityLabel={`Open ${entry.title} ${formatNavigationDestination(entry.navigation.target)} details`}
                accessibilityRole="button"
                activeOpacity={0.85}
                className="min-h-11 justify-center rounded-xl border border-border p-3"
                key={`${entry.kind}-${entry.id}`}
                onPress={() => entry.navigation && onOpenEntry(entry.navigation)}
                testID={`planning-ledger-entry-${entry.kind}-${entry.id}`}
              >
                {content}
              </TouchableOpacity>
            ) : (
              <View
                className="rounded-xl border border-border p-3"
                key={`${entry.kind}-${entry.id}`}
              >
                {content}
              </View>
            );
          })
        ) : (
          <Text className="text-sm text-muted-foreground">
            No entries are recorded for this period.
          </Text>
        )}
      </Section>
      {ledger.entriesTruncated ? (
        <Text className="text-xs text-muted-foreground" testID="planning-ledger-entry-cap">
          Showing the first 500 entries in chronological order.
        </Text>
      ) : null}

      <Section title="Goals and milestones" testID="planning-ledger-milestones">
        {ledger.milestones.length ? (
          ledger.milestones.map((milestone) => (
            <View className="gap-1" key={milestone.id}>
              <Text className="font-medium text-foreground">{milestone.label}</Text>
              <Text className="text-xs text-muted-foreground">
                {formatDate(milestone.date)}
                {milestone.activityCategory ? ` · ${milestone.activityCategory}` : ""}
              </Text>
            </View>
          ))
        ) : (
          <Text className="text-sm text-muted-foreground">No goal dates fall in this period.</Text>
        )}
      </Section>

      {!compact ? (
        <View className="gap-3 border-t border-border pt-4">
          <TouchableOpacity
            accessibilityLabel={`Data details${dataDetailsFlag ? `, ${dataDetailsFlag}` : ""}`}
            accessibilityRole="button"
            accessibilityState={{ expanded: dataDetailsOpen }}
            className="min-h-11 flex-row items-center justify-between rounded-xl border border-border px-3"
            onPress={() => setDataDetailsOpen((open) => !open)}
            testID="planning-ledger-data-details-trigger"
          >
            <View className="flex-1">
              <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
                Data details
              </Text>
              {dataDetailsFlag ? (
                <Text className="text-xs font-medium text-destructive">{dataDetailsFlag}</Text>
              ) : null}
            </View>
            {dataDetailsOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </TouchableOpacity>
          {dataDetailsOpen ? (
            <View className="gap-5" testID="planning-ledger-data-details">
              <Section title="Source coverage" testID="planning-ledger-source-coverage">
                {[
                  ["Completed activities", ledger.sourceCoverage.activities],
                  ["Scheduled items", ledger.sourceCoverage.scheduledItems],
                  ["Calendar events", ledger.sourceCoverage.calendarEvents],
                  ["Group events", ledger.sourceCoverage.groupEvents],
                ].map(([label, source]) => (
                  <Text
                    accessible
                    accessibilityLabel={`${label}: ${sourceLabel(source as PlanningLedger["sourceCoverage"]["activities"])}`}
                    className="text-sm text-foreground"
                    key={label as string}
                  >
                    {label as string}:{" "}
                    {sourceLabel(source as PlanningLedger["sourceCoverage"]["activities"])}
                  </Text>
                ))}
              </Section>

              <Section title="Model context" testID="planning-ledger-model-context">
                <Text className="text-sm text-foreground">
                  Common load: {ledger.modelContext.commonLoadModel} v
                  {ledger.modelContext.commonLoadVersion}
                </Text>
                <Text className="text-sm text-foreground">
                  Published revision: {ledger.modelContext.publishedRevision ?? "Unavailable"}
                </Text>
                <Text className="text-sm text-foreground">
                  Algorithm: {ledger.modelContext.algorithmVersion ?? "Unavailable"}
                </Text>
              </Section>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function formatNavigationDestination(target: NavigationTarget["target"]) {
  return target === "group_event" ? "group event" : target;
}

function getDataDetailsFlag(ledger: PlanningLedger) {
  const sources = Object.values(ledger.sourceCoverage);
  if (ledger.entriesTruncated) return "Entries truncated";
  if (sources.some((source) => source === null)) return "Source coverage unavailable";
  if (sources.some((source) => source?.status === "partial")) return "Partial source coverage";
  if (
    ledger.modelContext.publishedRevision === null ||
    ledger.modelContext.algorithmVersion === null
  ) {
    return "Model metadata unavailable";
  }
  return null;
}
