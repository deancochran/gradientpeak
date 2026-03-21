import type { EmptyStateCardProps } from "./shared";

export const emptyStateCardFixtures = {
  generic: {
    title: "Nothing here yet",
    description: "Try adjusting your filters or create something new.",
    actionLabel: "Create item",
    iconSize: 48,
    iconColor: "text-muted-foreground",
  } satisfies EmptyStateCardProps,
};
