import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { Circle } from "lucide-react";

export const Route = createFileRoute("/_protected/record")({
  component: RecordPage,
});

function RecordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <Circle className="h-5 w-5 text-muted-foreground" />
          Record
        </CardTitle>
        <CardDescription>Recording launcher scaffold for web parity.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Web recording is not implemented yet. This route is the future launcher for supported
        browser-based recording and upload flows.
      </CardContent>
    </Card>
  );
}
