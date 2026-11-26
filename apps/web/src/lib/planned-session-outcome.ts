import type { CalendarProjectionItem } from "@repo/core";

type PlannedSessionLifecycle =
  | { status: "scheduled" }
  | { status: "cancelled" }
  | {
      status: "completed";
      completion:
        | { state: "skipped" }
        | { state: "linked" | "activity_deleted"; outcome?: "full" | "partial" };
    };

export function getPlannedSessionOutcomeLabel(lifecycle: PlannedSessionLifecycle) {
  if (lifecycle.status === "scheduled") return "Scheduled";
  if (lifecycle.status === "cancelled") return "Cancelled";
  if (lifecycle.completion.state === "skipped") return "Skipped";
  if (lifecycle.completion.outcome === "partial") return "Partially completed";
  return "Completed";
}

export function describePlannedSessionOutcome(lifecycle: PlannedSessionLifecycle) {
  if (lifecycle.status === "scheduled") return "This session is scheduled.";
  if (lifecycle.status === "cancelled") return "This session was cancelled.";
  if (lifecycle.completion.state === "skipped") return "This session was skipped.";
  if (lifecycle.completion.outcome === "partial") return "This session was partially completed.";
  return "This session is completed.";
}

export function getCalendarStatusLabel(status: CalendarProjectionItem["status"]) {
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  if (status === "expired") return "Unverified";
  return "Scheduled";
}
