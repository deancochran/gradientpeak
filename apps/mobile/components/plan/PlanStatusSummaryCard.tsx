import { Text } from "@/components/ui/text";
import { View } from "react-native";

type FeasibilityState = "feasible" | "aggressive" | "unsafe";
type SafetyState = "safe" | "caution" | "exceeded";

type Assessment = {
  state: string;
  reasons?: string[];
};

interface PlanStatusSummaryCardProps {
  planFeasibility?: Assessment;
  planSafety?: Assessment;
  activeGoalFeasibility?: Assessment;
  activeGoalSafety?: Assessment;
  divergenceSummary?: string;
  confidence?: number;
}

function feasibilityStyles(state: string) {
  const normalized = state.toLowerCase() as FeasibilityState;
  if (normalized === "feasible") {
    return {
      container: "bg-emerald-500/15 border-emerald-500/30",
      text: "text-emerald-700 dark:text-emerald-300",
    };
  }
  if (normalized === "aggressive") {
    return {
      container: "bg-amber-500/15 border-amber-500/30",
      text: "text-amber-700 dark:text-amber-300",
    };
  }
  return {
    container: "bg-red-500/15 border-red-500/30",
    text: "text-red-700 dark:text-red-300",
  };
}

function safetyStyles(state: string) {
  const normalized = state.toLowerCase() as SafetyState;
  if (normalized === "safe") {
    return {
      container: "bg-emerald-500/15 border-emerald-500/30",
      text: "text-emerald-700 dark:text-emerald-300",
    };
  }
  if (normalized === "caution") {
    return {
      container: "bg-amber-500/15 border-amber-500/30",
      text: "text-amber-700 dark:text-amber-300",
    };
  }
  return {
    container: "bg-red-500/15 border-red-500/30",
    text: "text-red-700 dark:text-red-300",
  };
}

function confidenceLabel(confidence?: number) {
  if (confidence === undefined || confidence === null) {
    return "Unknown";
  }

  if (confidence >= 0.75) {
    return "High";
  }

  if (confidence >= 0.45) {
    return "Medium";
  }

  return "Low";
}

function stateText(value?: string) {
  if (!value) {
    return "unknown";
  }

  return value.replace(/_/g, " ");
}

function Pill({
  label,
  className,
  textClassName,
}: {
  label: string;
  className: string;
  textClassName: string;
}) {
  return (
    <View className={`px-2.5 py-1 rounded-full border ${className}`}>
      <Text className={`text-[11px] font-medium ${textClassName}`}>
        {label}
      </Text>
    </View>
  );
}

export function PlanStatusSummaryCard({
  planFeasibility,
  planSafety,
  activeGoalFeasibility,
  activeGoalSafety,
  divergenceSummary,
  confidence,
}: PlanStatusSummaryCardProps) {
  const primaryReason =
    planSafety?.reasons?.[0] ||
    planFeasibility?.reasons?.[0] ||
    activeGoalSafety?.reasons?.[0] ||
    activeGoalFeasibility?.reasons?.[0];

  const activeGoalFeasibilityStyle = feasibilityStyles(
    activeGoalFeasibility?.state || "unsafe",
  );
  const activeGoalSafetyStyle = safetyStyles(
    activeGoalSafety?.state || "exceeded",
  );
  const planFeasibilityStyle = feasibilityStyles(
    planFeasibility?.state || "unsafe",
  );
  const planSafetyStyle = safetyStyles(planSafety?.state || "exceeded");

  return (
    <View className="bg-card border border-border rounded-lg p-4 gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold">Status Summary</Text>
        <View className="px-2.5 py-1 rounded-full bg-muted">
          <Text className="text-[11px] font-medium text-muted-foreground">
            Confidence {confidenceLabel(confidence)}
          </Text>
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-xs text-muted-foreground">Active Goal</Text>
        <View className="flex-row flex-wrap gap-2">
          <Pill
            label={`Feasibility ${stateText(activeGoalFeasibility?.state)}`}
            className={activeGoalFeasibilityStyle.container}
            textClassName={activeGoalFeasibilityStyle.text}
          />
          <Pill
            label={`Safety ${stateText(activeGoalSafety?.state)}`}
            className={activeGoalSafetyStyle.container}
            textClassName={activeGoalSafetyStyle.text}
          />
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-xs text-muted-foreground">Plan-wide</Text>
        <View className="flex-row flex-wrap gap-2">
          <Pill
            label={`Feasibility ${stateText(planFeasibility?.state)}`}
            className={planFeasibilityStyle.container}
            textClassName={planFeasibilityStyle.text}
          />
          <Pill
            label={`Safety ${stateText(planSafety?.state)}`}
            className={planSafetyStyle.container}
            textClassName={planSafetyStyle.text}
          />
        </View>
      </View>

      <View className="bg-muted/50 rounded-md p-3">
        <Text className="text-sm text-foreground">
          {divergenceSummary || "No divergence signal available yet."}
        </Text>
        {primaryReason ? (
          <Text className="text-xs text-muted-foreground mt-1">
            Driver: {stateText(primaryReason)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
