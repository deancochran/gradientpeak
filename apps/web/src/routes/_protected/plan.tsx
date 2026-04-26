import { Badge } from "@repo/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { Target } from "lucide-react";

export const Route = createFileRoute("/_protected/plan")({
  component: PlanPage,
});

function PlanPage() {
  const plannedSections = [
    "Training Plans",
    "Activity Plans",
    "Scheduled Activities",
    "Training Preferences",
  ] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <Target className="h-5 w-5 text-muted-foreground" />
          Plan
        </CardTitle>
        <CardDescription>Planning hub scaffold for web parity.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          This route will grow into the main planning hub that mirrors the mobile plan surface.
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          {plannedSections.map((section) => (
            <Badge key={section} variant="outline">
              {section}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
