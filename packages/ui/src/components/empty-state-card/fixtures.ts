import type { EmptyStateCardProps } from "./shared";

export const emptyStateCardFixtures = {
  generic: {
    title: "Nothing here yet",
    description: "Try adjusting your filters or create something new.",
    actionLabel: "Create item",
    iconSize: 48,
    iconColor: "text-muted-foreground",
  } satisfies EmptyStateCardProps,
  unavailable: {
    title: "Coaching organizations are unavailable",
    description:
      "We could not load your coaching organizations. Your Personal workspace remains available while you try again.",
    actionLabel: "Try again",
    tone: "unavailable",
  } satisfies EmptyStateCardProps,
  recoverableError: {
    title: "The request could not be completed",
    description: "Your changes are still available. Try the request again.",
    actionLabel: "Try again",
    tone: "error",
  } satisfies EmptyStateCardProps,
  denied: {
    title: "This workspace is not available to you",
    description: "Choose another workspace or return to your own account.",
    actionLabel: "Choose workspace",
    tone: "denied",
  } satisfies EmptyStateCardProps,
  longText: {
    title: "No organization has assigned this unusually long athlete identity summary yet",
    description:
      "Try adjusting your filters or return after an organization administrator has completed the assignment. This explanation remains readable without changing the hierarchy or action order.",
    actionLabel: "Return to assignments",
  } satisfies EmptyStateCardProps,
  unbrokenText: {
    title: "AthleteIdentity".repeat(8),
    description: "AssignmentContext".repeat(8),
    actionLabel: "RetryOrganizationAssignment".repeat(4),
  } satisfies EmptyStateCardProps,
};
