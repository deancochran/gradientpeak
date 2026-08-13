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

function FactGrid({ facts }: { facts: Array<{ label: string; value: string; detail?: string }> }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {facts.map((fact) => (
        <View
          accessible
          accessibilityLabel={`${fact.label}: ${fact.value}${fact.detail ? `. ${fact.detail}` : ""}`}
          className="min-w-[30%] flex-1 rounded-xl bg-muted/30 p-3"
          key={fact.label}
        >
          <Text className="text-xs text-muted-foreground">{fact.label}</Text>
          <Text className="mt-1 text-base font-semibold text-foreground">{fact.value}</Text>
          {fact.detail ? (
            <Text className="mt-1 text-[10px] text-muted-foreground">{fact.detail}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function PlanningLedgerView({
  ledger,
  onOpenEntry,
}: {
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
    <View className="gap-5 px-4 pb-8 pt-4" testID="planning-ledger-content">
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

      <Section title="Load accounting" testID="planning-ledger-load">
        <FactGrid
          facts={[
            { label: "Completed", value: formatLoad(ledger.load.completed) },
            { label: "Planned", value: formatLoad(ledger.load.planned) },
            { label: "Remaining", value: formatLoad(ledger.load.remaining) },
            { label: "Effective", value: formatLoad(ledger.load.effective) },
            {
              label: "Intensity",
              value: formatIntensity(ledger.intensity),
              detail: statusDetail(ledger.intensity.status),
            },
            {
              label: "Contributing duration",
              value: formatDuration(ledger.contributingDurationSeconds),
              detail: statusDetail(ledger.contributingDurationSeconds.status),
            },
          ]}
        />
      </Section>

      <Section title="Training state" testID="planning-ledger-training-state">
        <FactGrid
          facts={[
            {
              label: "Actual fitness",
              value: formatState(ledger.trainingState.actual.fitness),
              detail: ledger.trainingState.actual.fitness.observedOn
                ? `Actual · ${formatDate(ledger.trainingState.actual.fitness.observedOn)}`
                : undefined,
            },
            {
              label: "Planned fitness projection",
              value: formatState(ledger.trainingState.planned.fitness),
              detail: ledger.trainingState.planned.fitness.observedOn
                ? `Scheduled projection · ${formatDate(ledger.trainingState.planned.fitness.observedOn)}`
                : undefined,
            },
            {
              label: "Actual fatigue",
              value: formatState(ledger.trainingState.actual.fatigue),
              detail: ledger.trainingState.actual.fatigue.observedOn
                ? `Actual · ${formatDate(ledger.trainingState.actual.fatigue.observedOn)}`
                : undefined,
            },
            {
              label: "Planned fatigue projection",
              value: formatState(ledger.trainingState.planned.fatigue),
              detail: ledger.trainingState.planned.fatigue.observedOn
                ? `Scheduled projection · ${formatDate(ledger.trainingState.planned.fatigue.observedOn)}`
                : undefined,
            },
          ]}
        />
      </Section>

      {ledger.period !== "day" ? (
        <Section title="Daily breakdown" testID="planning-ledger-daily-breakdown">
          {ledger.dailyBreakdown.length ? (
            ledger.dailyBreakdown.map((day) => (
              <View className="gap-1 rounded-xl bg-muted/20 p-3" key={day.date}>
                <Text className="font-medium text-foreground">{formatDate(day.date)}</Text>
                <Text className="text-xs text-muted-foreground">
                  Completed {formatLoad(day.completed)} · Planned {formatLoad(day.planned)}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Remaining {formatLoad(day.remaining)} · Effective {formatLoad(day.effective)} ·
                  Intensity {formatIntensity(day.intensity)}
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
              entry.load.status === "unavailable"
                ? ""
                : ` · Load ${formatLoad(entry.load)}${entry.load.status === "partial" ? " (partial)" : ""}`;
            const intensityLabel =
              entry.intensity.status === "unavailable"
                ? ""
                : ` · Intensity ${formatIntensity(entry.intensity)}${entry.intensity.status === "partial" ? " (partial)" : ""}`;
            const durationLabel =
              entry.contributingDurationSeconds.status === "unavailable"
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
