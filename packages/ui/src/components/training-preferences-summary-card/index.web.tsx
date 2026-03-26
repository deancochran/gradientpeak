import { Button } from "../button/index.web";
import { Card, CardContent, CardHeader, CardTitle } from "../card/index.web";
import type { TrainingPreferencesSummaryCardProps } from "./shared";

function TrainingPreferencesSummaryCard({
  actionLabel = "Open Preferences",
  items,
  onActionPress,
  title = "Training Preferences",
}: TrainingPreferencesSummaryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="gap-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-sm font-medium text-foreground">{item.value}</p>
          </div>
        ))}
        <Button variant="outline" onClick={onActionPress}>
          {actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

export type {
  TrainingPreferenceSummaryItem,
  TrainingPreferencesSummaryCardProps,
} from "./shared";
export { TrainingPreferencesSummaryCard };
