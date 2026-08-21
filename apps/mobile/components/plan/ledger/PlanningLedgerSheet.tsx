import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import type { TrainingPathLedgerSelection } from "@/components/plan/training-path/TrainingPathLoadChartSection";
import { PointInTimeDetailsSheet } from "@/components/shared/PointInTimeDetailsSheet";
import { api } from "@/lib/api";
import { parseDateKey } from "@/lib/calendar/dateMath";
import { PlanningLedgerView } from "./PlanningLedgerView";

type LedgerNavigationTarget = {
  target: "activity" | "event" | "group_event" | "goal";
  id: string;
};

type PlanningLedgerSheetProps = {
  onClose: () => void;
  onOpenEntry: (target: LedgerNavigationTarget) => void;
  selection: (TrainingPathLedgerSelection & { period: "week" | "month" }) | null;
};

function periodTitle(period: "week" | "month") {
  return `${period === "week" ? "Week" : "Month"} details`;
}

function selectionDescription(selection: TrainingPathLedgerSelection) {
  return `Selected ${selection.period} · ${format(parseDateKey(selection.anchorDate), "MMM d, yyyy")}`;
}

export function PlanningLedgerSheet({ onClose, onOpenEntry, selection }: PlanningLedgerSheetProps) {
  const request = selection ?? { anchorDate: "1970-01-01", period: "week" as const };
  const query = api.trainingPlans.getPlanningLedger.useQuery(request, {
    enabled: selection !== null,
  });

  return (
    <PointInTimeDetailsSheet
      {...(selection ? { contentKey: `${selection.period}:${selection.anchorDate}` } : {})}
      {...(selection ? { description: selectionDescription(selection) } : {})}
      onClose={onClose}
      portalName="planning-ledger-sheet"
      testID="planning-ledger-sheet"
      title={selection ? periodTitle(selection.period) : "Planning details"}
      visible={selection !== null}
    >
      {query.isLoading ? (
        <View className="flex-1 items-center justify-center gap-3 py-8">
          <ActivityIndicator accessibilityLabel="Loading planning details" />
          <Text className="text-sm text-muted-foreground">Loading planning details…</Text>
        </View>
      ) : query.isError ? (
        <View
          accessibilityRole="alert"
          className="flex-1 items-center justify-center gap-3 px-6 py-8"
          testID="planning-ledger-sheet-error"
        >
          <Text className="text-center text-sm text-muted-foreground">
            Planning details could not be loaded.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            className="rounded-xl border border-border px-4 py-3"
            onPress={() => void query.refetch()}
            testID="planning-ledger-sheet-retry"
          >
            <Text className="text-sm font-semibold text-foreground">Try again</Text>
          </TouchableOpacity>
        </View>
      ) : query.data ? (
        <PlanningLedgerView compact ledger={query.data} onOpenEntry={onOpenEntry} />
      ) : (
        <View className="flex-1 items-center justify-center px-6 py-8">
          <Text className="text-center text-sm text-muted-foreground">
            No planning details are available for this period.
          </Text>
        </View>
      )}
    </PointInTimeDetailsSheet>
  );
}
