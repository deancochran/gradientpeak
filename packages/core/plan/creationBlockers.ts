import type { CreationFeasibilitySafetySummary, ProfileGoal } from "../schemas";
import { diffDateOnlyUtcDays } from "./dateOnlyUtc";

export interface BlockingConflictLike {
  code: string;
  severity: "blocking" | "warning";
  message: string;
  suggestions: string[];
}

export interface BlockingIssue {
  code: string;
  message: string;
  suggestions: string[];
}

export interface ValidationGoalLike {
  targetDate: string;
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SUPPRESSED_OBSERVATION_CODES = new Set<string>([
  "required_tss_ramp_exceeds_cap",
  "required_ctl_ramp_exceeds_cap",
]);

export function getMinimumGoalGapDays(goals: ValidationGoalLike[]): number | undefined {
  const sortedGoalDates = goals
    .map((goal) => goal.targetDate)
    .filter((targetDate) => DATE_ONLY_PATTERN.test(targetDate))
    .sort((a, b) => a.localeCompare(b));

  if (sortedGoalDates.length < 2) {
    return undefined;
  }

  let minimumGapDays = Number.POSITIVE_INFINITY;

  for (let index = 0; index < sortedGoalDates.length - 1; index += 1) {
    const currentDate = sortedGoalDates[index];
    const nextDate = sortedGoalDates[index + 1];
    if (!currentDate || !nextDate) {
      continue;
    }

    const gapDays = diffDateOnlyUtcDays(currentDate, nextDate);
    if (gapDays < minimumGapDays) {
      minimumGapDays = gapDays;
    }
  }

  return Number.isFinite(minimumGapDays) ? minimumGapDays : undefined;
}

export function getTopBlockingIssues(input: {
  conflictItems: BlockingConflictLike[];
  feasibilitySafetySummary?: CreationFeasibilitySafetySummary;
  limit?: number;
}): BlockingIssue[] {
  const limit = input.limit ?? 3;
  const dedupe = new Set<string>();
  const merged: BlockingIssue[] = [];

  for (const conflict of input.conflictItems) {
    if (conflict.severity !== "blocking") {
      continue;
    }
    if (SUPPRESSED_OBSERVATION_CODES.has(conflict.code)) {
      continue;
    }
    const key = `${conflict.code}:${conflict.message.trim().toLowerCase()}`;
    if (dedupe.has(key)) {
      continue;
    }
    dedupe.add(key);
    merged.push({
      code: conflict.code,
      message: conflict.message,
      suggestions: conflict.suggestions,
    });
  }

  const blockers = input.feasibilitySafetySummary?.blockers ?? [];
  for (const blocker of blockers) {
    if (SUPPRESSED_OBSERVATION_CODES.has(blocker.code)) {
      continue;
    }
    const key = `${blocker.code}:${blocker.message.trim().toLowerCase()}`;
    if (dedupe.has(key)) {
      continue;
    }
    dedupe.add(key);
    merged.push({
      code: blocker.code,
      message: blocker.message,
      suggestions: [],
    });
  }

  return merged.slice(0, limit);
}

export function getCreateDisabledReason(blockingIssues: BlockingIssue[]): string | undefined {
  if (blockingIssues.length === 0) {
    return undefined;
  }

  if (blockingIssues.length === 1) {
    return "Create is disabled until 1 blocking conflict is resolved.";
  }

  return `Create is disabled until ${blockingIssues.length} blocking conflicts are resolved.`;
}

export interface ValidationGoalTargetLike {
  id: string;
  targetType: "hr_threshold";
  targetLthrBpm: number;
}

export interface ValidationGoalRecord {
  id: string;
  name: string;
  targetDate: string;
  priority: number;
  targets: ValidationGoalTargetLike[];
}

export function mapProfileGoalsToValidationGoals(
  profileGoals: Array<ProfileGoal & { target_date?: string | null }>,
): ValidationGoalRecord[] {
  return profileGoals.map((goal) => ({
    id: goal.id,
    name: goal.title,
    targetDate: goal.target_date ?? "",
    priority: goal.priority,
    targets: [
      {
        id: `${goal.id}-fallback-target`,
        targetType: "hr_threshold",
        targetLthrBpm:
          goal.objective.type === "threshold" && goal.objective.metric === "hr"
            ? Math.round(goal.objective.value)
            : 160,
      },
    ],
  }));
}
