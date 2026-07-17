import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Pause, Play, RotateCcw, Timer, Trash2 } from "lucide-react";

import { useTimerOnlyRecording } from "../../../lib/recording/provider";

export const Route = createFileRoute("/_protected/record/session")({
  component: RecordSessionPage,
});

export function RecordSessionPage() {
  const recording = useTimerOnlyRecording();
  const { lifecycle, snapshot } = recording.state.reducer;
  const configuration = recording.state.configuration;

  if (recording.hydrationStatus === "hydrating") {
    return (
      <div className="mx-auto max-w-2xl py-4">
        <Card>
          <CardHeader>
            <CardTitle>Checking for a saved timer</CardTitle>
            <CardDescription>
              The timer will remain stopped while this browser checks for a recoverable draft.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!configuration) {
    return (
      <div className="mx-auto max-w-2xl py-4">
        <Card>
          <CardHeader>
            <CardTitle>No recording session</CardTitle>
            <CardDescription>
              Configure a timer-only session from the recording launcher first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recording.error ? (
              <p className="mb-4 text-sm text-destructive" role="alert">
                {recording.error}
              </p>
            ) : null}
            <Button asChild>
              <Link to="/record" search={{ category: "run", gps: "off" }}>
                Return to recorder
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-4">
      <Card>
        <CardHeader className="space-y-4 text-center">
          <div className="flex flex-wrap justify-center gap-2">
            <Badge variant="outline">Timer only</Badge>
            <Badge>{lifecycleLabel(lifecycle)}</Badge>
          </div>
          <CardTitle className="flex items-center justify-center gap-2 text-3xl">
            <Timer className="h-7 w-7" />
            {snapshot?.activity.category ?? configuration.category} session
          </CardTitle>
          <CardDescription>
            Keep this page open in the foreground. This browser periodically saves a bounded timer
            draft for paused recovery after an interruption.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {recording.hasRecoveredDraft ? (
            <div className="space-y-3 rounded-lg border border-primary/40 p-4 text-left">
              <div>
                <p className="font-medium">Recovered safely in paused state</p>
                <p className="text-sm text-muted-foreground">
                  Review the restored times, then resume explicitly or discard this draft.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button disabled={recording.hydrationStatus !== "ready"} onClick={recording.resume}>
                  <Play className="h-4 w-4" /> Resume
                </Button>
                <Button variant="outline" onClick={recording.discardRecoveredDraft}>
                  <Trash2 className="h-4 w-4" /> Discard
                </Button>
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-4 text-center">
            <TimeStat label="Elapsed" seconds={recording.elapsedSeconds} />
            <TimeStat label="Moving" seconds={recording.movingSeconds} />
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            {lifecycle === "pending" ? (
              <Button size="lg" onClick={recording.start}>
                <Play className="h-5 w-5" /> Start
              </Button>
            ) : null}
            {lifecycle === "recording" ? (
              <Button size="lg" variant="outline" onClick={recording.pause}>
                <Pause className="h-5 w-5" /> Pause
              </Button>
            ) : null}
            {lifecycle === "paused" && !recording.hasRecoveredDraft ? (
              <Button
                size="lg"
                disabled={recording.hydrationStatus !== "ready"}
                onClick={recording.resume}
              >
                <Play className="h-5 w-5" /> Resume
              </Button>
            ) : null}
            {lifecycle === "finished" ? (
              <Button size="lg" variant="outline" onClick={recording.reset}>
                <RotateCcw className="h-5 w-5" /> Reset
              </Button>
            ) : null}
          </div>

          {recording.error ? (
            <p className="text-center text-sm text-destructive" role="alert">
              {recording.error}
            </p>
          ) : null}

          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            This slice records elapsed and moving time only. Pause before leaving so the timer can
            be recovered safely. Finish remains unavailable until a finalized artifact can be saved
            without deleting the only durable draft. GPS, BLE/FTMS sensors, FIT files, and
            background recording are not available.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TimeStat({ label, seconds }: { label: string; seconds: number }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-mono text-3xl font-semibold tabular-nums">{formatTimer(seconds)}</p>
    </div>
  );
}

function formatTimer(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function lifecycleLabel(lifecycle: string): string {
  if (lifecycle === "pending") return "Ready to start";
  if (lifecycle === "recording") return "Recording";
  if (lifecycle === "paused") return "Paused";
  if (lifecycle === "finished") return "Finished";
  return lifecycle;
}
