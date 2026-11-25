import { Badge } from "@repo/ui/components/badge";

import { getActivityBadgeLabel, getActivityEmoji } from "../lib/activity-route-helpers";

function uniqueCategories(categories: readonly string[]) {
  return [...new Set(categories.length > 0 ? categories : ["other"])];
}

export function ActivityCategoryIcons({ categories }: { categories: readonly string[] }) {
  const unique = uniqueCategories(categories);
  return (
    <div className="flex shrink-0 -space-x-2">
      <span className="sr-only">{unique.map(getActivityBadgeLabel).join(", ")}</span>
      {unique.map((category) => (
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-card bg-primary/10 text-xl"
          key={category}
          title={getActivityBadgeLabel(category)}
        >
          {getActivityEmoji(category)}
        </span>
      ))}
    </div>
  );
}

export function ActivityCategoryBadges({ categories }: { categories: readonly string[] }) {
  return uniqueCategories(categories).map((category) => (
    <Badge className="gap-1.5" key={category} variant="secondary">
      <span aria-hidden="true">{getActivityEmoji(category)}</span>
      {getActivityBadgeLabel(category)}
    </Badge>
  ));
}
