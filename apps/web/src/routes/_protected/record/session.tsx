import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Pause, Play, Save, Square, Timer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { uploadFileToSignedUrl } from "../../../lib/activity-route-upload";
import { api } from "../../../lib/api/client";
import { buildCreateFromRecordingSummaryInput } from "../../../lib/recording/finalized-artifact";
import { useTimerOnlyRecording } from "../../../lib/recording/provider";

export const Route = createFileRoute("/_protected/record/session")({
  component: RecordSessionPage,
});

export function RecordSessionPage() {
  const recording = useTimerOnlyRecording();
  const { lifecycle, snapshot } = recording.state.reducer;
  const configuration = recording.state.configuration;
  const getSignedUrl = api.activityFiles.getSignedUploadUrl.useMutation();
  const createActivity = api.activities.createFromRecordingSummary.useMutation();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [perceivedEffort, setPerceivedEffort] = useState("");
  const [distanceMeters, setDistanceMeters] = useState("0");
  const [calories, setCalories] = useState("");

  useEffect(() => {
    if (!recording.artifact) return;
    setName(recording.artifact.review.name);
    setNotes(recording.artifact.review.notes ?? "");
    setPerceivedEffort(recording.artifact.review.perceivedEffort?.toString() ?? "");
    setDistanceMeters(recording.artifact.review.distanceMeters.toString());
    setCalories(recording.artifact.review.calories?.toString() ?? "");
  }, [recording.artifact]);

  const submit = useCallback(
    async (artifact: NonNullable<typeof recording.artifact>) => {
      const file = new File([artifact.fileText], artifact.fileName, {
        type: "application/vnd.garmin.tcx+xml",
      });
      const signed = await getSignedUrl.mutateAsync({
        fileName: file.name,
        fileSize: file.size,
      });
      await uploadFileToSignedUrl(file, signed.signedUrl);
      const created = await createActivity.mutateAsync(
        buildCreateFromRecordingSummaryInput(artifact, {
          bucket: "activity-files",
          path: signed.filePath,
        }),
      );
      return { activityId: created.id };
    },
    [createActivity, getSignedUrl],
  );

  useEffect(() => {
    if (
      recording.submissionJob?.status !== "queued" &&
      recording.submissionJob?.status !== "submitting"
    )
      return;
    void recording.drainSubmissionQueue(submit);
  }, [recording.drainSubmissionQueue, recording.submissionJob?.status, submit]);

  useEffect(() => {
    const drain = () => void recording.drainSubmissionQueue(submit);
    window.addEventListener("online", drain);
    const interval = window.setInterval(drain, 30_000);
    return () => {
      window.removeEventListener("online", drain);
      window.clearInterval(interval);
    };
  }, [recording.drainSubmissionQueue, submit]);

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
            {recording.canTakeOver ? (
              <Button
                className="mb-4"
                variant="destructive"
                onClick={() => void recording.takeOver()}
              >
                Take over this recording
              </Button>
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
            {lifecycle === "recording" || lifecycle === "paused" ? (
              <Button
                size="lg"
                variant="destructive"
                disabled={recording.busy}
                onClick={recording.finish}
              >
                <Square className="h-5 w-5" /> {recording.busy ? "Finishing…" : "Finish"}
              </Button>
            ) : null}
          </div>

          {recording.error ? (
            <p className="text-center text-sm text-destructive" role="alert">
              {recording.error}
            </p>
          ) : null}

          {lifecycle === "finished" && recording.artifact ? (
            <section
              className="space-y-4 rounded-xl border p-4 text-left"
              aria-labelledby="record-review-heading"
            >
              <div>
                <h2 id="record-review-heading" className="text-lg font-semibold">
                  Review recording
                </h2>
                <p className="text-sm text-muted-foreground">
                  The finished artifact is durable locally. Save queues an idempotent server
                  submission.
                </p>
              </div>
              <label className="grid gap-1 text-sm" htmlFor="recording-name">
                <span className="font-medium">Activity name</span>
                <Input
                  id="recording-name"
                  value={name}
                  maxLength={200}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm" htmlFor="recording-notes">
                <span className="font-medium">Notes</span>
                <Textarea
                  id="recording-notes"
                  value={notes}
                  maxLength={4000}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-sm" htmlFor="recording-rpe">
                  <span className="font-medium">Perceived effort (1–10)</span>
                  <Input
                    id="recording-rpe"
                    type="number"
                    min={1}
                    max={10}
                    value={perceivedEffort}
                    onChange={(event) => setPerceivedEffort(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm" htmlFor="recording-distance">
                  <span className="font-medium">Distance (metres)</span>
                  <Input
                    id="recording-distance"
                    type="number"
                    min={0}
                    step={1}
                    value={distanceMeters}
                    onChange={(event) => setDistanceMeters(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm" htmlFor="recording-calories">
                  <span className="font-medium">Calories</span>
                  <Input
                    id="recording-calories"
                    type="number"
                    min={0}
                    step={1}
                    value={calories}
                    onChange={(event) => setCalories(event.target.value)}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={
                    recording.busy ||
                    !name.trim() ||
                    recording.submissionJob?.status === "submitted"
                  }
                  onClick={() =>
                    void recording.save({
                      name: name.trim(),
                      notes: notes.trim() || null,
                      perceivedEffort: perceivedEffort ? Number(perceivedEffort) : null,
                      distanceMeters: Number(distanceMeters || 0),
                      calories: calories ? Number(calories) : null,
                    })
                  }
                >
                  <Save className="h-4 w-4" /> Save activity
                </Button>
                {recording.submissionJob?.status === "retry_wait" ? (
                  <Button variant="outline" onClick={() => void recording.retrySubmission()}>
                    Retry now
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  disabled={recording.busy || recording.submissionJob?.status === "submitted"}
                  onClick={() => void recording.discardFinalizedArtifact()}
                >
                  <Trash2 className="h-4 w-4" /> Discard
                </Button>
              </div>
              {recording.submissionJob ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Submission: {submissionLabel(recording.submissionJob.status)}
                  {recording.submissionJob.lastError
                    ? ` (${recording.submissionJob.lastError.replaceAll("_", " ")})`
                    : ""}
                </p>
              ) : null}
              {recording.submissionJob?.activityId ? (
                <div className="flex flex-wrap gap-3">
                  <Button asChild variant="outline">
                    <Link
                      to="/activities/$activityId"
                      params={{ activityId: recording.submissionJob.activityId }}
                    >
                      Open saved activity
                    </Link>
                  </Button>
                  <Button onClick={recording.reset}>Start a new recording</Button>
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Browser recording captures foreground elapsed and moving time without GPS. Local
            recovery, finalization, and submission are durable. BLE/FTMS is available only through
            an active platform adapter; this browser workflow does not assume Chrome-only Web
            Bluetooth.
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

function submissionLabel(status: string): string {
  if (status === "queued") return "queued locally";
  if (status === "submitting") return "submitting";
  if (status === "retry_wait") return "waiting to retry";
  if (status === "submitted") return "saved on server";
  return status;
}
