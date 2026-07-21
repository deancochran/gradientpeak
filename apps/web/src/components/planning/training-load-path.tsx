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

function LoadValue({ value }: { value: number | null }) {
  return value === null ? (
    <Badge variant="outline">Estimate unavailable</Badge>
  ) : (
    <Badge>{Math.round(value)} TSS estimated</Badge>
  );
}

export function TrainingLoadPath({ events }: { events: PlanningEvent[] }) {
  const path = getTrainingLoadPath(events);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Training path</CardTitle>
        <CardDescription>
          Daily and weekly planned load from persisted scheduled activity estimates.
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
                  <LoadValue value={point.estimatedTss} />
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
                  <LoadValue value={point.estimatedTss} />
                </div>
              ))}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
