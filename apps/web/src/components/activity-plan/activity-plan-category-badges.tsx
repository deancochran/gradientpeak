import { Badge } from "@repo/ui/components/badge";

const labels: Record<string, string> = {
  bike: "Cycling",
  other: "Other",
  run: "Running",
  strength: "Strength",
  swim: "Swimming",
};

export function ActivityPlanCategoryBadges({ categories }: { categories: readonly string[] }) {
  return categories.map((category) => (
    <Badge key={category} variant="secondary">
      {labels[category] ?? category}
    </Badge>
  ));
}
