import type {
  ActivityPlanDuration,
  ActivityPlanIntervalStep,
  ActivityPlanSegmentV3,
  CanonicalSport,
  EditableActivityPlanStructure,
} from "@repo/core";
import { activityPlanStructureSchemaV3 } from "@repo/core/activity-plan";
import {
  type ActivityTargetType,
  activityTargetDefinitionByType,
  activityTargetTypes,
} from "@repo/core/targets";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  createActivityPlanInterval,
  createActivityPlanSegment,
  createActivityPlanStep,
  createActivityPlanStructure,
  moveActivityPlanItem,
  updateActivityInterval,
  updateActivitySegment,
  updateActivityStep,
} from "../../lib/activity-plan-authoring";

const sports = ["run", "bike", "swim", "strength", "other"] as const;
const visibilityOptions = ["private", "followers", "public"] as const;
const selectClassName =
  "h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type ActivityPlanAuthoringValues = {
  description: string | null;
  gps_recording_enabled: boolean;
  name: string;
  notes: string | null;
  route_id: string | null;
  structure: ReturnType<typeof activityPlanStructureSchemaV3.parse>;
  template_visibility: (typeof visibilityOptions)[number];
};

type ActivityPlanComposerProps = {
  initial?: {
    description?: string | null;
    gps_recording_enabled?: boolean;
    name: string;
    notes?: string | null;
    route_id?: string | null;
    structure: unknown;
    template_visibility?: string | null;
  };
  mode: "create" | "edit";
  onCancel: () => void;
  onSave: (values: ActivityPlanAuthoringValues) => Promise<void> | void;
  pending?: boolean;
  routeOptions?: ReadonlyArray<{ id: string; name: string }>;
};

function editableStructure(value: unknown): EditableActivityPlanStructure {
  const parsed = activityPlanStructureSchemaV3.safeParse(value);
  return parsed.success
    ? { version: 3, segments: [...parsed.data.segments] }
    : createActivityPlanStructure();
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return (
    <label className="text-sm font-medium" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

function numberValue(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function defaultTargetIntensity(type: ActivityTargetType) {
  const definition = activityTargetDefinitionByType[type];
  if (type === "RPE") return 5;
  if (type.startsWith("%")) return 75;
  return Math.max(definition.minimum, 1);
}

function durationAmount(duration: ActivityPlanDuration) {
  if (duration.type === "time") return duration.seconds;
  if (duration.type === "distance") return duration.meters;
  if (duration.type === "repetitions") return duration.count;
  return 1;
}

function nextDuration(type: ActivityPlanDuration["type"], amount: number): ActivityPlanDuration {
  if (type === "time") return { type, seconds: Math.max(1, Math.round(amount)) };
  if (type === "distance") return { type, meters: Math.max(1, Math.round(amount)) };
  if (type === "repetitions") return { type, count: Math.max(1, Math.round(amount)) };
  return { type: "untilFinished" };
}

export function ActivityPlanComposer({
  initial,
  mode,
  onCancel,
  onSave,
  pending = false,
  routeOptions = [],
}: ActivityPlanComposerProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [visibility, setVisibility] = useState<ActivityPlanAuthoringValues["template_visibility"]>(
    initial?.template_visibility === "public" || initial?.template_visibility === "followers"
      ? initial.template_visibility
      : "private",
  );
  const [gpsEnabled, setGpsEnabled] = useState(initial?.gps_recording_enabled ?? true);
  const [routeId, setRouteId] = useState(initial?.route_id ?? "");
  const [structure, setStructure] = useState<EditableActivityPlanStructure>(() =>
    initial ? editableStructure(initial.structure) : createActivityPlanStructure(),
  );
  const parsed = useMemo(() => activityPlanStructureSchemaV3.safeParse(structure), [structure]);
  const firstIssue = parsed.success ? null : parsed.error.issues[0]?.message;

  const removeSegment = (segmentId: string) => {
    setStructure((current) => ({
      version: 3,
      segments: current.segments.filter((segment) => segment.id !== segmentId),
    }));
  };

  const removeInterval = (intervalId: string) => {
    setStructure((current) => ({
      version: 3,
      segments: current.segments.map((segment) =>
        segment.role === "activity"
          ? {
              ...segment,
              intervals: segment.intervals.filter((interval) => interval.id !== intervalId),
            }
          : segment,
      ),
    }));
  };

  const removeStep = (intervalId: string, stepId: string) => {
    setStructure((current) =>
      updateActivityInterval(current, intervalId, (interval) => ({
        ...interval,
        steps: interval.steps.filter((step) => step.id !== stepId),
      })),
    );
  };

  const save = async () => {
    const validStructure = activityPlanStructureSchemaV3.safeParse(structure);
    if (!name.trim() || !validStructure.success) return;
    await onSave({
      description: description.trim() || null,
      gps_recording_enabled: gpsEnabled,
      name: name.trim(),
      notes: notes.trim() || null,
      route_id: routeId || null,
      structure: validStructure.data,
      template_visibility: visibility,
    });
  };

  return (
    <div className="space-y-6" data-testid="activity-plan-composer">
      <Card>
        <CardHeader>
          <CardTitle>{mode === "edit" ? "Edit activity plan" : "Create activity plan"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <FieldLabel htmlFor="activity-plan-name">Plan name</FieldLabel>
            <Input
              id="activity-plan-name"
              maxLength={255}
              onChange={(event) => setName(event.currentTarget.value)}
              required
              value={name}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <FieldLabel htmlFor="activity-plan-description">Description</FieldLabel>
            <Textarea
              id="activity-plan-description"
              maxLength={1000}
              onChange={(event) => setDescription(event.currentTarget.value)}
              value={description}
            />
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="activity-plan-visibility">Visibility</FieldLabel>
            <select
              className={`${selectClassName} w-full`}
              id="activity-plan-visibility"
              onChange={(event) =>
                setVisibility(
                  event.currentTarget.value as ActivityPlanAuthoringValues["template_visibility"],
                )
              }
              value={visibility}
            >
              {visibilityOptions.map((option) => (
                <option key={option} value={option}>
                  {option[0]?.toUpperCase()}
                  {option.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-3 self-end rounded-lg border px-3 py-2 text-sm">
            <input
              checked={gpsEnabled}
              onChange={(event) => setGpsEnabled(event.currentTarget.checked)}
              type="checkbox"
            />
            GPS recording enabled
          </label>
          <div className="space-y-2 md:col-span-2">
            <FieldLabel htmlFor="activity-plan-route">Route</FieldLabel>
            <select
              className={`${selectClassName} w-full`}
              id="activity-plan-route"
              onChange={(event) => setRouteId(event.currentTarget.value)}
              value={routeId}
            >
              <option value="">No route</option>
              {routeOptions.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Optionally attach a route you can access for terrain and distance context.
            </p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <FieldLabel htmlFor="activity-plan-notes">Coach or athlete notes</FieldLabel>
            <Textarea
              id="activity-plan-notes"
              maxLength={2000}
              onChange={(event) => setNotes(event.currentTarget.value)}
              value={notes}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Workout structure</h2>
          <p className="text-sm text-muted-foreground">
            Build portable V3 activity, transition, and rest segments in execution order.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["activity", "transition", "rest"] as const).map((role) => (
            <Button
              key={role}
              onClick={() =>
                setStructure((current) => ({
                  version: 3,
                  segments: [...current.segments, createActivityPlanSegment(role)],
                }))
              }
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus className="mr-1 h-4 w-4" />
              {role === "activity" ? "Activity" : role === "transition" ? "Transition" : "Rest"}
            </Button>
          ))}
        </div>
      </div>

      {structure.segments.map((segment, segmentIndex) => (
        <SegmentEditor
          key={segment.id}
          index={segmentIndex}
          onChange={(update) =>
            setStructure((current) => updateActivitySegment(current, segment.id, update))
          }
          onMove={(offset) =>
            setStructure((current) => ({
              version: 3,
              segments: moveActivityPlanItem(current.segments, segmentIndex, offset),
            }))
          }
          onRemove={() => removeSegment(segment.id)}
          onRemoveInterval={removeInterval}
          onRemoveStep={removeStep}
          segment={segment}
          setStructure={setStructure}
          structure={structure}
        />
      ))}

      {firstIssue ? (
        <p
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          Structure needs attention: {firstIssue}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button disabled={pending} onClick={onCancel} type="button" variant="outline">
          Cancel
        </Button>
        <Button
          disabled={pending || !name.trim() || !parsed.success}
          onClick={() => void save()}
          type="button"
        >
          {pending ? "Saving..." : mode === "edit" ? "Save changes" : "Create plan"}
        </Button>
      </div>
    </div>
  );
}

type SegmentEditorProps = {
  index: number;
  onChange: (update: (segment: ActivityPlanSegmentV3) => ActivityPlanSegmentV3) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
  onRemoveInterval: (intervalId: string) => void;
  onRemoveStep: (intervalId: string, stepId: string) => void;
  segment: ActivityPlanSegmentV3;
  setStructure: React.Dispatch<React.SetStateAction<EditableActivityPlanStructure>>;
  structure: EditableActivityPlanStructure;
};

function SegmentEditor({
  index,
  onChange,
  onMove,
  onRemove,
  onRemoveInterval,
  onRemoveStep,
  segment,
  setStructure,
  structure,
}: SegmentEditorProps) {
  return (
    <Card data-testid={`activity-plan-segment-${index}`}>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="capitalize">
          {index + 1}. {segment.role}
        </CardTitle>
        <div className="flex gap-1">
          <Button
            aria-label="Move segment up"
            onClick={() => onMove(-1)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            aria-label="Move segment down"
            onClick={() => onMove(1)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            aria-label="Delete segment"
            onClick={onRemove}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel htmlFor={`segment-name-${segment.id}`}>Segment name</FieldLabel>
            <Input
              id={`segment-name-${segment.id}`}
              maxLength={100}
              onChange={(event) => {
                const value = event.currentTarget.value;
                onChange((item) => ({ ...item, name: value }));
              }}
              value={segment.name}
            />
          </div>
          {segment.role === "activity" ? (
            <div className="space-y-2">
              <FieldLabel htmlFor={`segment-sport-${segment.id}`}>Sport</FieldLabel>
              <select
                className={`${selectClassName} w-full`}
                id={`segment-sport-${segment.id}`}
                onChange={(event) => {
                  const category = event.currentTarget.value as CanonicalSport;
                  onChange((item) => (item.role === "activity" ? { ...item, category } : item));
                }}
                value={segment.category}
              >
                {sports.map((sport) => (
                  <option key={sport} value={sport}>
                    {sport}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-2">
              <FieldLabel htmlFor={`segment-seconds-${segment.id}`}>Duration (seconds)</FieldLabel>
              <Input
                id={`segment-seconds-${segment.id}`}
                min={1}
                onChange={(event) => {
                  const seconds = Math.max(1, numberValue(event.currentTarget.value, 1));
                  onChange((item) =>
                    item.role === "activity"
                      ? item
                      : {
                          ...item,
                          duration: { type: "time", seconds },
                        },
                  );
                }}
                type="number"
                value={segment.duration.seconds}
              />
            </div>
          )}
        </div>

        {segment.role === "activity" ? (
          <div className="space-y-4">
            {segment.intervals.map((interval, intervalIndex) => (
              <div className="space-y-3 rounded-xl border bg-muted/10 p-4" key={interval.id}>
                <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto]">
                  <div className="space-y-2">
                    <FieldLabel htmlFor={`interval-name-${interval.id}`}>Interval name</FieldLabel>
                    <Input
                      id={`interval-name-${interval.id}`}
                      onChange={(event) => {
                        const name = event.currentTarget.value;
                        setStructure((current) =>
                          updateActivityInterval(current, interval.id, (item) => ({
                            ...item,
                            name,
                          })),
                        );
                      }}
                      value={interval.name}
                    />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel htmlFor={`interval-repetitions-${interval.id}`}>Repeats</FieldLabel>
                    <Input
                      id={`interval-repetitions-${interval.id}`}
                      min={1}
                      onChange={(event) => {
                        const repetitions = Math.max(1, numberValue(event.currentTarget.value, 1));
                        setStructure((current) =>
                          updateActivityInterval(current, interval.id, (item) => ({
                            ...item,
                            repetitions,
                          })),
                        );
                      }}
                      type="number"
                      value={interval.repetitions}
                    />
                  </div>
                  <Button
                    aria-label={`Delete interval ${intervalIndex + 1}`}
                    className="self-end"
                    onClick={() => onRemoveInterval(interval.id)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {interval.steps.map((step, stepIndex) => (
                  <StepEditor
                    index={stepIndex}
                    intervalId={interval.id}
                    key={step.id}
                    onRemove={() => onRemoveStep(interval.id, step.id)}
                    setStructure={setStructure}
                    step={step}
                  />
                ))}
                <Button
                  onClick={() =>
                    setStructure((current) =>
                      updateActivityInterval(current, interval.id, (item) => ({
                        ...item,
                        steps: [
                          ...item.steps,
                          createActivityPlanStep(`Step ${item.steps.length + 1}`),
                        ],
                      })),
                    )
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Plus className="mr-1 h-4 w-4" /> Add step
                </Button>
              </div>
            ))}
            <Button
              onClick={() =>
                setStructure(
                  updateActivitySegment(structure, segment.id, (item) =>
                    item.role === "activity"
                      ? {
                          ...item,
                          intervals: [
                            ...item.intervals,
                            createActivityPlanInterval(`Interval ${item.intervals.length + 1}`),
                          ],
                        }
                      : item,
                  ),
                )
              }
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus className="mr-1 h-4 w-4" /> Add interval
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StepEditor({
  index,
  intervalId,
  onRemove,
  setStructure,
  step,
}: {
  index: number;
  intervalId: string;
  onRemove: () => void;
  setStructure: React.Dispatch<React.SetStateAction<EditableActivityPlanStructure>>;
  step: ActivityPlanIntervalStep;
}) {
  const target = step.targets[0] ?? { type: "RPE" as const, intensity: 5 };
  const update = (updater: (value: ActivityPlanIntervalStep) => ActivityPlanIntervalStep) =>
    setStructure((current) => updateActivityStep(current, intervalId, step.id, updater));

  return (
    <div className="grid gap-3 rounded-lg border bg-background p-3 md:grid-cols-[1.2fr_9rem_8rem_9rem_7rem_auto]">
      <div className="space-y-2">
        <FieldLabel htmlFor={`step-name-${step.id}`}>Step {index + 1}</FieldLabel>
        <Input
          id={`step-name-${step.id}`}
          onChange={(event) => {
            const name = event.currentTarget.value;
            update((item) => ({ ...item, name }));
          }}
          value={step.name}
        />
      </div>
      <div className="space-y-2">
        <FieldLabel htmlFor={`step-duration-type-${step.id}`}>Duration</FieldLabel>
        <select
          className={`${selectClassName} w-full`}
          id={`step-duration-type-${step.id}`}
          onChange={(event) => {
            const type = event.currentTarget.value as ActivityPlanDuration["type"];
            update((item) => ({
              ...item,
              duration: nextDuration(type, durationAmount(item.duration)),
            }));
          }}
          value={step.duration.type}
        >
          <option value="time">Time</option>
          <option value="distance">Distance</option>
          <option value="repetitions">Repetitions</option>
          <option value="untilFinished">Until finished</option>
        </select>
      </div>
      <div className="space-y-2">
        <FieldLabel htmlFor={`step-duration-${step.id}`}>Amount</FieldLabel>
        <Input
          disabled={step.duration.type === "untilFinished"}
          id={`step-duration-${step.id}`}
          min={1}
          onChange={(event) => {
            const amount = numberValue(event.currentTarget.value, durationAmount(step.duration));
            update((item) => ({
              ...item,
              duration: nextDuration(item.duration.type, amount),
            }));
          }}
          type="number"
          value={durationAmount(step.duration)}
        />
      </div>
      <div className="space-y-2">
        <FieldLabel htmlFor={`step-target-${step.id}`}>Target</FieldLabel>
        <select
          className={`${selectClassName} w-full`}
          id={`step-target-${step.id}`}
          onChange={(event) => {
            const type = event.currentTarget.value as ActivityTargetType;
            update(
              (item) =>
                ({
                  ...item,
                  targets: [{ type, intensity: defaultTargetIntensity(type) }],
                }) as ActivityPlanIntervalStep,
            );
          }}
          value={target.type}
        >
          {activityTargetTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <FieldLabel htmlFor={`step-intensity-${step.id}`}>Intensity</FieldLabel>
        <Input
          id={`step-intensity-${step.id}`}
          min={activityTargetDefinitionByType[target.type].minimum}
          onChange={(event) => {
            const intensity = numberValue(event.currentTarget.value, target.intensity);
            update(
              (item) =>
                ({
                  ...item,
                  targets: [
                    {
                      type: target.type,
                      intensity,
                    },
                  ],
                }) as ActivityPlanIntervalStep,
            );
          }}
          type="number"
          value={target.intensity}
        />
      </div>
      <Button
        aria-label={`Delete step ${index + 1}`}
        className="self-end"
        onClick={onRemove}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
