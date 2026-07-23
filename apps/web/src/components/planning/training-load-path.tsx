import { Badge } from "@repo/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";

import { formatShortDayLabel, getTrainingLoadPath, type PlanningEvent } from "../../lib/planning";

function LoadValue({
  load,
  status,
}: {
  load: number | null;
  status: "complete" | "partial" | "unavailable";
}) {
  if (load === null) return <Badge variant="outline">Load unavailable</Badge>;
  return (
    <Badge variant={status === "complete" ? "default" : "outline"}>
      Load {Math.round(load)}
      {status === "partial" ? " · partial" : ""}
    </Badge>
  );
}

export function TrainingLoadPath({ events }: { events: PlanningEvent[] }) {
  const path = getTrainingLoadPath(events);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Training path</CardTitle>
        <CardDescription>
          Daily and weekly common Load from scheduled activity plans; partial and unavailable data
          remain explicit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {path.daily.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Schedule planned activities to build a load path.
          </p>
        ) : (
          <Tabs defaultValue="daily">
            <TabsList>
              <TabsTrigger value="daily">Daily</TabsTrigger>
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
            </TabsList>
            <TabsContent value="daily" className="space-y-2">
              {path.daily.map((point) => (
                <div
                  key={point.date}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div>
                    <p className="font-medium">{formatShortDayLabel(point.date)}</p>
                    <p className="text-xs text-muted-foreground">
                      {point.eventCount} scheduled {point.eventCount === 1 ? "session" : "sessions"}
                    </p>
                  </div>
                  <LoadValue load={point.load} status={point.status} />
                </div>
              ))}
            </TabsContent>
            <TabsContent value="weekly" className="space-y-2">
              {path.weekly.map((point) => (
                <div
                  key={point.weekStart}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div>
                    <p className="font-medium">Week of {formatShortDayLabel(point.weekStart)}</p>
                    <p className="text-xs text-muted-foreground">
                      {point.eventCount} scheduled {point.eventCount === 1 ? "session" : "sessions"}
                    </p>
                  </div>
                  <LoadValue load={point.load} status={point.status} />
                </div>
              ))}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
