import type {
  ActivityPlanAdaptation,
  ActivityPlanDuration,
  ActivityPlanInterval,
  ActivityPlanIntervalStep,
  ActivityPlanSegment,
  ActivityPlanTrainingIntent,
  CanonicalActivityCategory,
  EditableActivityPlanStructure,
} from "@repo/core";
import {
  activityPlanTargetSchema,
  calculateActivityPlanStats,
  compileActivityPlan,
} from "@repo/core";
import {
  activityPlanAuthoringContentSchema,
  activityPlanStructureSchema,
  consolidateActivityPlanText,
  deriveActivityPlanPresentation,
  getPermissibleActivityPlanDurationTypes,
} from "@repo/core/activity-plan";
import {
  type ActivityTargetType,
  activityTargetDefinitionByType,
  activityTargetTypes,
  getActivityTargetRole,
  getPermissibleTargetTypes,
} from "@repo/core/targets";
import { parseNumberOrUndefined } from "@repo/core/utils/fitness-inputs";
import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Input } from "@repo/ui/components/input";
import { SegmentedDurationField } from "@repo/ui/components/segmented-duration-field";
import {
  type DurationSegments,
  formatDurationSeconds,
  parseDurationSegments,
  splitDurationSeconds,
} from "@repo/ui/components/segmented-duration-field/shared";
import { Textarea } from "@repo/ui/components/textarea";
import { ArrowDown, ArrowUp, Ellipsis, Plus, Trash2, X } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  applyActivityPlanActivityCategory,
  createActivityPlanInterval,
  createActivityPlanStep,
  createActivityPlanStructure,
  duplicateActivityPlanInterval,
  getActivityPlanActivityCategory,
  moveActivityPlanItem,
  updateActivityInterval,
  updateActivitySegment,
  updateActivityStep,
} from "../../lib/activity-plan-authoring";
import { useUnsavedChangesGuard } from "../../lib/use-unsaved-changes-guard";
import { ActivityPlanTimelineChart } from "./activity-plan-timeline-chart";

const activity_categories = ["run", "bike", "swim", "strength", "other"] as const;
const visibilityOptions = ["private", "followers", "public"] as const;
const selectClassName =
  "h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type NumericDraft = {
  integer: boolean;
  min: number;
  max?: number;
  value: string;
  segments?: DurationSegments;
};
type ContextEditor =
  | { stepId: string; kind: "purpose" | "duration" | "details" }
  | { stepId: string; kind: "target"; targetKey: number };
const StepEditingContext = createContext<{
  active: ContextEditor | null;
  setActive: (editor: ContextEditor | null) => void;
  drafts: Record<string, NumericDraft>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, NumericDraft>>>;
  editors: React.RefObject<Map<string, { openField: (id: string) => void }>>;
} | null>(null);

export type ActivityPlanAuthoringValues = {
  adaptation?: ActivityPlanAdaptation | null;
  description: string | null;
  gps_recording_enabled: boolean;
  name: string;
  notes: string | null;
  structure: ReturnType<typeof activityPlanStructureSchema.parse>;
  training_intent?: ActivityPlanTrainingIntent;
  content_visibility: (typeof visibilityOptions)[number];
};

type ActivityPlanComposerProps = {
  initial?: {
    adaptation?: ActivityPlanAdaptation | null;
    description?: string | null;
    gps_recording_enabled?: boolean;
    name: string;
    notes?: string | null;
    structure: unknown;
    training_intent?: ActivityPlanTrainingIntent;
    content_visibility?: string | null;
  };
  mode: "create" | "edit";
  onCancel: () => void;
  onSave: (values: ActivityPlanAuthoringValues) => Promise<void> | void;
  onSaved?: () => Promise<void> | void;
  pending?: boolean;
};

function editableStructure(value: unknown): EditableActivityPlanStructure | null {
  const parsed = activityPlanStructureSchema.safeParse(value);
  return parsed.success
    ? {
        version: 3,
        activity_category: parsed.data.activity_category,
        segments: [...parsed.data.segments],
      }
    : null;
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return (
    <label className="text-sm font-medium" htmlFor={htmlFor}>
      {children}
    </label>
  );
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

function focusEditorField(id: string) {
  const field =
    document.getElementById(id) ??
    (id.startsWith("step-duration-") && id.endsWith("-field")
      ? document.getElementById(
          id.replace("step-duration-", "step-duration-type-").replace(/-field$/, ""),
        )
      : id.startsWith("step-add-target-")
        ? document.getElementById(`${id.replace("step-add-target-", "step-target-")}-0`)
        : null);
  if (!field) return;
  let ancestor = field.parentElement;
  while (ancestor) {
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
    ancestor = ancestor.parentElement;
  }
  field.scrollIntoView?.({ block: "nearest", behavior: "auto" });
  field.focus({ preventScroll: true });
}

function issueFieldId(structure: EditableActivityPlanStructure, path: PropertyKey[]) {
  const [, , segmentIndex, , intervalIndex, , stepIndex, field, targetIndex, targetField] = path;
  if (typeof segmentIndex !== "number") return "activity-plan-name";
  const segment = structure.segments[segmentIndex];
  if (!segment) return "activity-plan-name";
  if (segment.role !== "activity") return `segment-seconds-${segment.id}-field`;
  if (typeof intervalIndex !== "number") return `segment-add-interval-${segment.id}`;
  const interval = segment.intervals[intervalIndex];
  if (!interval) return `segment-add-interval-${segment.id}`;
  if (typeof stepIndex !== "number") {
    if (path[5] === "repetitions") return `interval-repetitions-${interval.id}-field`;
    if (path[5] === "name") return `interval-name-${interval.id}`;
    if (path[5] === "notes") return `interval-instructions-${interval.id}`;
    return `interval-add-step-${interval.id}`;
  }
  const step = interval.steps[stepIndex];
  if (!step) return `interval-add-step-${interval.id}`;
  if (field === "duration")
    return targetIndex === "type" || step.duration.type === "untilFinished"
      ? `step-duration-type-${step.id}`
      : `step-duration-${step.id}-field`;
  if (field === "targets") {
    if (typeof targetIndex !== "number") return `step-add-target-${step.id}`;
    return targetField === "type"
      ? `step-target-${step.id}-${targetIndex}`
      : `step-intensity-${step.id}-${targetIndex}-field`;
  }
  if (field === "notes" || field === "description") return `step-instructions-${step.id}`;
  return `step-${field === "name" ? "name" : "purpose"}-${step.id}`;
}

export function ActivityPlanComposer({
  initial,
  mode,
  onCancel,
  onSave,
  onSaved,
  pending = false,
}: ActivityPlanComposerProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(
    () => consolidateActivityPlanText(initial?.description, initial?.notes, "Notes") ?? "",
  );
  const [visibility, setVisibility] = useState<ActivityPlanAuthoringValues["content_visibility"]>(
    initial?.content_visibility === "public" || initial?.content_visibility === "followers"
      ? initial.content_visibility
      : "private",
  );
  const [gpsEnabled, setGpsEnabled] = useState(initial?.gps_recording_enabled ?? true);
  const [initialStructure] = useState(() =>
    initial ? editableStructure(initial.structure) : null,
  );
  const [structure, setStructure] = useState<EditableActivityPlanStructure>(
    () => initialStructure ?? createActivityPlanStructure(),
  );
  const [activity_category, setActivityCategory] = useState<CanonicalActivityCategory>(() =>
    getActivityPlanActivityCategory(structure),
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveGuard = useRef(false);
  const busy = pending || saving;
  const [selectedStep, setSelectedStep] = useState<{
    intervalId: string;
    stepId: string;
  } | null>(() => {
    const segment = structure.segments.find((item) => item.role === "activity");
    const interval = segment?.intervals[0];
    const step = interval?.steps[0];
    return interval && step ? { intervalId: interval.id, stepId: step.id } : null;
  });
  const [numericDrafts, setNumericDrafts] = useState<Record<string, NumericDraft>>({});
  const [activeEditor, setActiveEditor] = useState<ContextEditor | null>(null);
  const editors = useRef(new Map<string, { openField: (id: string) => void }>());
  const [focusRequest, setFocusRequest] = useState<{ id: string } | null>(null);
  const requestFieldFocus = (id: string) => setFocusRequest({ id });
  useEffect(() => {
    if (!focusRequest) return;
    const owner = [...editors.current].find(([stepId]) => focusRequest.id.includes(stepId));
    if (owner) owner[1].openField(focusRequest.id);
    else focusEditorField(focusRequest.id);
  }, [focusRequest]);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const initialDraft = useRef<string | null>(null);
  const parsed = useMemo(() => activityPlanStructureSchema.safeParse(structure), [structure]);
  const authoring = useMemo(
    () =>
      activityPlanAuthoringContentSchema.safeParse({
        structure,
        intent: { training_intent: initial?.training_intent ?? "general_maintenance" },
        adaptation: initial?.adaptation ?? null,
      }),
    [structure, initial?.training_intent, initial?.adaptation],
  );
  const structureStats = useMemo(() => {
    if (!parsed.success) return null;
    const stats = calculateActivityPlanStats(compileActivityPlan(parsed.data));
    return {
      distanceMeters: stats.duration.activity_categories.reduce(
        (total, category) => total + category.distanceMeters,
        0,
      ),
      occurrences: stats.occurrenceCount,
      timedSeconds: stats.duration.exactElapsedSeconds,
    };
  }, [parsed]);
  // Entries exist only while invalid; compound time/distance drafts keep their original text.
  const hasInvalidNumericDraft = Object.keys(numericDrafts).length > 0;
  const draftFingerprint = JSON.stringify({
    activity_category,
    description,
    gpsEnabled,
    name,
    structure,
    visibility,
    numericDrafts,
  });
  if (initialDraft.current === null) initialDraft.current = draftFingerprint;
  const { guardedCancel, markSaved } = useUnsavedChangesGuard({
    draft: draftFingerprint,
    dirty: draftFingerprint !== initialDraft.current,
    pending: busy,
  });
  useEffect(() => {
    if (saveError && !busy) saveButtonRef.current?.focus();
  }, [saveError, busy]);

  const removeSegment = (segmentId: string) => {
    const removed = structure.segments.find((segment) => segment.id === segmentId);
    if (
      removed?.role === "activity" &&
      structure.segments.filter((segment) => segment.role === "activity").length <= 1
    )
      return;
    const ids = [
      segmentId,
      ...(removed?.role === "activity"
        ? removed.intervals.flatMap((interval) => [
            interval.id,
            ...interval.steps.map((step) => step.id),
          ])
        : []),
    ];
    setNumericDrafts((drafts) =>
      Object.fromEntries(
        Object.entries(drafts).filter(([key]) => !ids.some((id) => key.includes(id))),
      ),
    );
    setStructure((current) => ({
      version: 3,
      activity_category: current.activity_category,
      segments:
        current.segments.find((segment) => segment.id === segmentId)?.role === "activity" &&
        current.segments.filter((segment) => segment.role === "activity").length <= 1
          ? current.segments
          : current.segments.filter((segment) => segment.id !== segmentId),
    }));
  };

  const removeInterval = (intervalId: string) => {
    const removedStepIds =
      structure.segments
        .flatMap((segment) => (segment.role === "activity" ? segment.intervals : []))
        .find((interval) => interval.id === intervalId)
        ?.steps.map((step) => step.id) ?? [];
    setNumericDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([key]) => !key.includes(intervalId) && !removedStepIds.some((id) => key.includes(id)),
        ),
      ),
    );
    setStructure((current) => ({
      version: 3,
      activity_category: current.activity_category,
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
    setNumericDrafts((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !key.includes(stepId))),
    );
    setStructure((current) =>
      updateActivityInterval(current, intervalId, (interval) => ({
        ...interval,
        steps: interval.steps.filter((step) => step.id !== stepId),
      })),
    );
  };

  const removeTarget = (intervalId: string, stepId: string, targetIndex: number) => {
    const prefix = `step-intensity-${stepId}-`;
    setNumericDrafts((drafts) =>
      Object.fromEntries(
        Object.entries(drafts).flatMap(([key, draft]) => {
          if (!key.startsWith(prefix)) return [[key, draft]];
          const index = Number(key.slice(prefix.length));
          return index === targetIndex
            ? []
            : [[`${prefix}${index > targetIndex ? index - 1 : index}`, draft]];
        }),
      ),
    );
    setStructure((current) =>
      updateActivityStep(current, intervalId, stepId, (step) => ({
        ...step,
        targets: step.targets.filter((_, index) => index !== targetIndex),
      })),
    );
  };

  const duplicateStep = (intervalId: string, step: ActivityPlanIntervalStep) => {
    const copy = {
      ...step,
      id: crypto.randomUUID(),
      duration: { ...step.duration },
      targets: step.targets.map((target) => ({ ...target })),
    };
    setNumericDrafts((current) => ({
      ...current,
      ...Object.fromEntries(
        Object.entries(current)
          .filter(([key]) => key.includes(step.id))
          .map(([key, value]) => [key.replace(step.id, copy.id), { ...value }]),
      ),
    }));
    setStructure((current) =>
      updateActivityInterval(current, intervalId, (interval) => ({
        ...interval,
        steps: interval.steps.flatMap((item) => (item.id === step.id ? [item, copy] : [item])),
      })),
    );
    return `step-duration-${copy.id}-field`;
  };

  const duplicateInterval = (interval: ActivityPlanInterval) => {
    const copy = duplicateActivityPlanInterval(interval);
    const identities = new Map([
      [interval.id, copy.id],
      ...interval.steps.flatMap((step, index) => {
        const copied = copy.steps[index];
        return copied ? [[step.id, copied.id] as const] : [];
      }),
    ]);
    setNumericDrafts((current) => {
      const copied = Object.entries(current).flatMap(([key, value]) => {
        const identity = [...identities].find(([id]) => key.includes(id));
        return identity ? [[key.replace(identity[0], identity[1]), { ...value }]] : [];
      });
      return { ...current, ...Object.fromEntries(copied) };
    });
    setStructure((current) => ({
      ...current,
      segments: current.segments.map((segment) =>
        segment.role === "activity"
          ? {
              ...segment,
              intervals: segment.intervals.flatMap((item) =>
                item.id === interval.id ? [item, copy] : [item],
              ),
            }
          : segment,
      ),
    }));
    requestFieldFocus(`interval-name-${copy.id}`);
  };

  const trackNumericDraft = (
    id: string,
    value: string,
    min: number,
    integer: boolean,
    max?: number,
  ) => {
    setNumericDrafts((current) => {
      const number = parseNumberOrUndefined(value);
      if (
        number !== undefined &&
        number >= min &&
        (max === undefined || number <= max) &&
        (!integer || Number.isInteger(number))
      ) {
        const { [id]: _, ...remaining } = current;
        return remaining;
      }
      return { ...current, [id]: { integer, min, ...(max === undefined ? {} : { max }), value } };
    });
  };

  const save = async () => {
    if (saveGuard.current || pending || saved) return;
    setSaveError(null);
    const validContent = activityPlanAuthoringContentSchema.safeParse({
      structure,
      intent: { training_intent: initial?.training_intent ?? "general_maintenance" },
      adaptation: initial?.adaptation ?? null,
    });
    if (hasInvalidNumericDraft) {
      const first = Object.keys(numericDrafts)[0];
      if (first) requestFieldFocus(`${first}-field`);
      return;
    }
    if (!name.trim() || !validContent.success) {
      requestFieldFocus(
        !name.trim()
          ? "activity-plan-name"
          : issueFieldId(
              structure,
              !validContent.success ? (validContent.error.issues[0]?.path ?? []) : [],
            ),
      );
      return;
    }
    saveGuard.current = true;
    setSaving(true);
    let committed = false;
    try {
      await onSave({
        ...(initial?.adaptation === undefined ? {} : { adaptation: initial.adaptation }),
        description: description.trim() ? description : null,
        gps_recording_enabled: gpsEnabled,
        name: name.trim(),
        notes: null,
        structure: validContent.data.structure,
        ...(initial?.training_intent === undefined
          ? {}
          : { training_intent: initial.training_intent }),
        content_visibility: visibility,
      });
      markSaved();
      committed = true;
      setSaved(true);
      await onSaved?.();
    } catch (error) {
      setSaveError(
        committed
          ? "Plan saved, but it could not be opened. Use Cancel to return to the library without saving again."
          : error instanceof Error && error.message === "STALE_ACTIVITY_PLAN_REVISION"
            ? "This plan changed elsewhere. Your changes are kept. Cancel and reopen the editor to load the latest saved plan."
            : error instanceof Error
              ? error.message
              : "Activity plan could not be saved.",
      );
      saveButtonRef.current?.focus();
    } finally {
      saveGuard.current = false;
      setSaving(false);
    }
  };

  if (initial && !initialStructure) {
    return (
      <Card className="border-destructive/40" data-testid="activity-plan-composer-unavailable">
        <CardHeader>
          <CardTitle>Plan unavailable for editing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This plan has an unsupported or malformed activity structure. It was not changed.
          </p>
          <Button onClick={onCancel} type="button" variant="outline">
            Back to plan
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <StepEditingContext.Provider
      value={{
        active: activeEditor,
        setActive: setActiveEditor,
        drafts: numericDrafts,
        setDrafts: setNumericDrafts,
        editors,
      }}
    >
      <form
        className="space-y-6"
        data-testid="activity-plan-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset
          disabled={busy || saved}
          className="min-w-0 space-y-6 border-0 p-0"
          aria-label="Activity plan authoring"
        >
          <Card className="shadow-none">
            <CardContent className="grid gap-3 pt-6 md:grid-cols-[12rem_1fr]">
              <div className="space-y-2">
                <FieldLabel htmlFor="activity-plan-activity_category">Activity category</FieldLabel>
                <select
                  className={`${selectClassName} w-full`}
                  id="activity-plan-activity_category"
                  onChange={(event) => {
                    const nextActivityCategory = event.currentTarget
                      .value as CanonicalActivityCategory;
                    if (nextActivityCategory === activity_category) return;
                    setActivityCategory(nextActivityCategory);
                    setStructure((current) =>
                      applyActivityPlanActivityCategory(current, nextActivityCategory),
                    );
                  }}
                  value={activity_category}
                >
                  {activity_categories.map((option) => (
                    <option key={option} value={option}>
                      {option[0]?.toUpperCase()}
                      {option.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="activity-plan-name">Plan name</FieldLabel>
                <Input
                  id="activity-plan-name"
                  maxLength={255}
                  onChange={(event) => setName(event.currentTarget.value)}
                  required
                  value={name}
                />
              </div>
              <details className="md:col-span-2">
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  Plan details and settings
                </summary>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <FieldLabel htmlFor="activity-plan-description">Description</FieldLabel>
                    <Textarea
                      id="activity-plan-description"
                      maxLength={3009}
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
                          event.currentTarget
                            .value as ActivityPlanAuthoringValues["content_visibility"],
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
                </div>
              </details>
              {parsed.success ? (
                <div className="space-y-2 md:col-span-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-sm font-medium">Session shape</p>
                    <p className="text-xs text-muted-foreground">
                      {structureStats?.timedSeconds === null
                        ? "Known quantities only"
                        : `${Math.round((structureStats?.timedSeconds ?? 0) / 60)} min`}
                      {structureStats && structureStats.distanceMeters > 0
                        ? ` · ${(structureStats.distanceMeters / 1000).toFixed(1)} km`
                        : ""}
                      {structureStats ? ` · ${structureStats.occurrences} steps` : ""}
                    </p>
                  </div>
                  <ActivityPlanTimelineChart
                    label="Editable activity plan timeline"
                    onOccurrenceSelect={(occurrence) => {
                      if (!occurrence.intervalId || !occurrence.stepId) return;
                      setSelectedStep({
                        intervalId: occurrence.intervalId,
                        stepId: occurrence.stepId,
                      });
                      requestFieldFocus(`step-duration-${occurrence.stepId}-field`);
                    }}
                    presentation={deriveActivityPlanPresentation(parsed.data)}
                    selectedOccurrenceId={
                      selectedStep
                        ? (deriveActivityPlanPresentation(parsed.data)?.occurrences.find(
                            (occurrence) =>
                              occurrence.intervalId === selectedStep.intervalId &&
                              occurrence.stepId === selectedStep.stepId,
                          )?.occurrenceId ?? null)
                        : null
                    }
                    testIDPrefix="activity-plan-composer-timeline"
                  />
                  <p className="text-xs text-muted-foreground">
                    Select a work bar to focus its step below.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {structure.segments.map((segment, segmentIndex) => (
            <SegmentEditor
              key={segment.id}
              disabled={busy || saved}
              index={segmentIndex}
              onChange={(update) =>
                setStructure((current) => updateActivitySegment(current, segment.id, update))
              }
              onMove={(offset) =>
                setStructure((current) => ({
                  version: 3,
                  activity_category: current.activity_category,
                  segments: moveActivityPlanItem(current.segments, segmentIndex, offset),
                }))
              }
              onRemove={() => removeSegment(segment.id)}
              onRemoveInterval={removeInterval}
              onRemoveStep={removeStep}
              onRemoveTarget={removeTarget}
              onDuplicateInterval={duplicateInterval}
              onDuplicateStep={duplicateStep}
              onFocusField={requestFieldFocus}
              numericDrafts={numericDrafts}
              onNumericDraft={trackNumericDraft}
              onSelectStep={(intervalId, stepId) => setSelectedStep({ intervalId, stepId })}
              selectedStep={selectedStep}
              segment={segment}
              setStructure={setStructure}
              structure={structure}
            />
          ))}

          {!authoring.success ? (
            <div
              className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              <p>
                Structure needs attention: correct these fields before saving. Existing values are
                retained.
              </p>
              <ul>
                {authoring.error.issues.map((issue) => (
                  <li key={`${issue.path.join(".")}-${issue.code}-${issue.message}`}>
                    <button
                      type="button"
                      className="text-left underline"
                      onClick={() => {
                        requestFieldFocus(issueFieldId(structure, issue.path));
                      }}
                    >
                      {issue.path.join(".")}: {issue.message}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {hasInvalidNumericDraft ? (
            <p
              className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              Correct incomplete numeric values or out-of-range targets before saving. Repeats and
              durations must be whole numbers of at least 1.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  const first = Object.keys(numericDrafts)[0];
                  if (first) requestFieldFocus(`${first}-field`);
                }}
              >
                Go to the first invalid value
              </button>
            </p>
          ) : null}
          {saveError ? (
            <p
              className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              {saveError}
            </p>
          ) : null}
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button
            disabled={busy}
            onClick={() => guardedCancel(onCancel)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={busy || saved || !name.trim() || !authoring.success || hasInvalidNumericDraft}
            ref={saveButtonRef}
            type="submit"
          >
            {busy ? "Saving..." : mode === "edit" ? "Save changes" : "Create plan"}
          </Button>
        </div>
        {busy ? <p role="status">Saving activity plan...</p> : null}
      </form>
    </StepEditingContext.Provider>
  );
}

type SegmentEditorProps = {
  disabled: boolean;
  onDuplicateStep: (intervalId: string, step: ActivityPlanIntervalStep) => string;
  onDuplicateInterval: (interval: ActivityPlanInterval) => void;
  onFocusField: (id: string) => void;
  numericDrafts: Record<string, { value: string }>;
  onRemoveTarget: (intervalId: string, stepId: string, targetIndex: number) => void;
  index: number;
  onChange: (update: (segment: ActivityPlanSegment) => ActivityPlanSegment) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
  onRemoveInterval: (intervalId: string) => void;
  onRemoveStep: (intervalId: string, stepId: string) => void;
  onNumericDraft: (id: string, value: string, min: number, integer: boolean, max?: number) => void;
  onSelectStep: (intervalId: string, stepId: string) => void;
  segment: ActivityPlanSegment;
  selectedStep: { intervalId: string; stepId: string } | null;
  setStructure: React.Dispatch<React.SetStateAction<EditableActivityPlanStructure>>;
  structure: EditableActivityPlanStructure;
};

function SegmentEditor({
  disabled,
  onDuplicateStep,
  onDuplicateInterval,
  onFocusField,
  numericDrafts,
  onRemoveTarget,
  index,
  onChange,
  onMove,
  onRemove,
  onRemoveInterval,
  onRemoveStep,
  onNumericDraft,
  onSelectStep,
  segment,
  selectedStep,
  setStructure,
  structure,
}: SegmentEditorProps) {
  const isLegacySection = structure.segments.length > 1;
  const canRemove =
    segment.role !== "activity" ||
    structure.segments.filter((item) => item.role === "activity").length > 1;
  return (
    <section className="space-y-4" data-testid={`activity-plan-segment-${index}`}>
      {isLegacySection ? (
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold capitalize">
            {segment.role === "activity" ? `Activity plan section ${index + 1}` : "Recovery"}
          </h2>
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
            {canRemove ? (
              <Button
                aria-label="Delete segment"
                onClick={onRemove}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="space-y-4">
        {isLegacySection ? (
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
            {segment.role !== "activity" ? (
              <div className="space-y-2">
                <BoundedNumberInput
                  clampProjection={false}
                  decimals={0}
                  id={`segment-seconds-${segment.id}`}
                  label="Duration (seconds)"
                  min={1}
                  onChange={(value) =>
                    onNumericDraft(`segment-seconds-${segment.id}`, value, 1, true)
                  }
                  onNumberChange={(seconds) => {
                    if (seconds === undefined) return;
                    onChange((item) =>
                      item.role === "activity"
                        ? item
                        : {
                            ...item,
                            duration: { type: "time", seconds },
                          },
                    );
                  }}
                  value={
                    numericDrafts[`segment-seconds-${segment.id}`]?.value ??
                    String(segment.duration.seconds)
                  }
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {segment.role === "activity" ? (
          <div className="space-y-4">
            {segment.intervals.map((interval, intervalIndex) => (
              <fieldset
                className="min-w-0 space-y-3 border-0 border-t border-border pt-4"
                key={interval.id}
                aria-label={`${isLegacySection ? `Section ${index + 1}, ` : ""}Interval ${intervalIndex + 1}: ${interval.name}`}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_5rem_2.75rem] items-end gap-2">
                  <div className="min-w-0">
                    <Input
                      aria-label="Interval name"
                      className="h-11 min-w-0 border-transparent bg-transparent px-0 font-semibold shadow-none"
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
                  <div className="min-w-0 [&_input]:h-11">
                    <BoundedNumberInput
                      clampProjection={false}
                      decimals={0}
                      id={`interval-repetitions-${interval.id}`}
                      label="Repeats"
                      min={1}
                      onChange={(value) =>
                        onNumericDraft(`interval-repetitions-${interval.id}`, value, 1, true)
                      }
                      onNumberChange={(repetitions) => {
                        if (repetitions === undefined) return;
                        setStructure((current) =>
                          updateActivityInterval(current, interval.id, (item) => ({
                            ...item,
                            repetitions,
                          })),
                        );
                      }}
                      value={
                        numericDrafts[`interval-repetitions-${interval.id}`]?.value ??
                        String(interval.repetitions)
                      }
                    />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label={`Interval ${intervalIndex + 1} actions`}
                        className="h-11 w-11 self-end"
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Ellipsis className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={disabled}
                        onSelect={() => onDuplicateInterval(interval)}
                      >
                        Duplicate interval
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={disabled}
                        onSelect={() => onRemoveInterval(interval.id)}
                      >
                        Delete interval
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <details>
                  <summary className="cursor-pointer text-sm text-muted-foreground">
                    {interval.notes
                      ? `Interval instructions: ${interval.notes}`
                      : "Add interval instructions"}
                  </summary>
                  <div className="mt-2 space-y-2">
                    <FieldLabel htmlFor={`interval-instructions-${interval.id}`}>
                      Instructions
                    </FieldLabel>
                    <Textarea
                      id={`interval-instructions-${interval.id}`}
                      maxLength={1000}
                      onChange={(event) => {
                        const notes = event.currentTarget.value;
                        setStructure((current) =>
                          updateActivityInterval(current, interval.id, (item) => ({
                            ...item,
                            notes,
                          })),
                        );
                      }}
                      value={interval.notes ?? ""}
                    />
                  </div>
                </details>
                {interval.steps.map((step, stepIndex) => (
                  <StepEditor
                    disabled={disabled}
                    selected={
                      selectedStep?.intervalId === interval.id && selectedStep.stepId === step.id
                    }
                    onFocus={() => onSelectStep(interval.id, step.id)}
                    context={`${isLegacySection ? `Section ${index + 1}, ` : ""}Interval ${intervalIndex + 1}, step ${stepIndex + 1}`}
                    numericDrafts={numericDrafts}
                    onRemoveTarget={(index) => onRemoveTarget(interval.id, step.id, index)}
                    activityCategory={structure.activity_category}
                    index={stepIndex}
                    intervalId={interval.id}
                    key={step.id}
                    onRemove={() => onRemoveStep(interval.id, step.id)}
                    onDuplicate={() => onDuplicateStep(interval.id, step)}
                    onFocusField={onFocusField}
                    onNumericDraft={onNumericDraft}
                    setStructure={setStructure}
                    step={step}
                  />
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button
                    id={`interval-add-step-${interval.id}`}
                    onClick={() => {
                      const step = createActivityPlanStep(`Step ${interval.steps.length + 1}`);
                      setStructure((current) =>
                        updateActivityInterval(current, interval.id, (item) => ({
                          ...item,
                          steps: [...item.steps, step],
                        })),
                      );
                      onFocusField(`step-duration-${step.id}-field`);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Plus className="mr-1 h-4 w-4" /> Add step
                  </Button>
                  <Button
                    onClick={() => {
                      const step = createActivityPlanStep("Recovery", "recovery");
                      setStructure((current) =>
                        updateActivityInterval(current, interval.id, (item) => ({
                          ...item,
                          steps: [...item.steps, step],
                        })),
                      );
                      onFocusField(`step-duration-${step.id}-field`);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Plus className="mr-1 h-4 w-4" /> Add recovery step
                  </Button>
                </div>
              </fieldset>
            ))}
            <Button
              id={`segment-add-interval-${segment.id}`}
              onClick={() => {
                const interval = createActivityPlanInterval(
                  `Interval ${segment.intervals.length + 1}`,
                );
                setStructure((current) =>
                  updateActivitySegment(current, segment.id, (item) =>
                    item.role === "activity"
                      ? {
                          ...item,
                          intervals: [...item.intervals, interval],
                        }
                      : item,
                  ),
                );
                onFocusField(`interval-name-${interval.id}`);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus className="mr-1 h-4 w-4" /> Add interval
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StepEditor({
  disabled,
  context,
  selected,
  onFocus,
  numericDrafts,
  onRemoveTarget,
  activityCategory,
  index,
  intervalId,
  onRemove,
  onDuplicate,
  onFocusField,
  onNumericDraft,
  setStructure,
  step,
}: {
  disabled: boolean;
  context: string;
  selected: boolean;
  onFocus: () => void;
  numericDrafts: Record<string, { value: string }>;
  onRemoveTarget: (index: number) => void;
  activityCategory: CanonicalActivityCategory;
  index: number;
  intervalId: string;
  onRemove: () => void;
  onDuplicate: () => string;
  onFocusField: (id: string) => void;
  onNumericDraft: (id: string, value: string, min: number, integer: boolean, max?: number) => void;
  setStructure: React.Dispatch<React.SetStateAction<EditableActivityPlanStructure>>;
  step: ActivityPlanIntervalStep;
}) {
  // Target rows have UI-only identities: removing an earlier target must not reuse its raw input.
  const [targetKeys, setTargetKeys] = useState(() => step.targets.map((_, index) => index));
  const nextTargetKey = useRef(step.targets.length);
  const instructions =
    consolidateActivityPlanText(step.notes, step.description, "Description") ?? "";
  const durationTypes = getPermissibleActivityPlanDurationTypes(activityCategory);
  const targetTypes =
    step.duration.type === "repetitions" ? ["RPE"] : getPermissibleTargetTypes(activityCategory);
  const update = (updater: (value: ActivityPlanIntervalStep) => ActivityPlanIntervalStep) =>
    setStructure((current) => updateActivityStep(current, intervalId, step.id, updater));

  const editing = useContext(StepEditingContext);
  if (!editing) throw new Error("Step editor requires its composer");
  const active = editing.active?.stepId === step.id ? editing.active : null;
  const editorRef = useRef<HTMLDivElement>(null);
  const durationRef = useRef<{ focus: () => void }>(null);
  const pendingField = useRef<string | null>(null);
  const snapshot = useRef<{
    selection: ContextEditor;
    step: ActivityPlanIntervalStep;
    draft: NumericDraft | undefined;
    distanceUnit: "m" | "km";
  } | null>(null);
  const [distanceUnit, setDistanceUnit] = useState<"m" | "km">("m");
  const durationKey = `step-duration-${step.id}`;
  const draftKey = (selection: ContextEditor) =>
    selection.kind === "target"
      ? `step-intensity-${step.id}-${targetKeys.indexOf(selection.targetKey)}`
      : durationKey;
  const triggerId = (selection: ContextEditor) =>
    `step-trigger-${step.id}-${selection.kind}${selection.kind === "target" ? `-${selection.targetKey}` : ""}`;
  const activate = (selection: ContextEditor, field: string) => {
    if (disabled) return;
    if (JSON.stringify(active) !== JSON.stringify(selection))
      snapshot.current = {
        selection,
        step: {
          ...step,
          duration: { ...step.duration },
          targets: step.targets.map((target) => ({ ...target })),
        },
        draft: editing.drafts[draftKey(selection)],
        distanceUnit,
      };
    pendingField.current = field;
    editing.setActive(selection);
  };
  const closeEditor = (revert: boolean) => {
    if (!active || disabled) return;
    // Flush the shared input's blur callback before applying an Escape snapshot.
    // Otherwise its late blur commit would overwrite the restored value/draft.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (revert && snapshot.current) {
      const saved = snapshot.current;
      if (active.kind === "duration") setDistanceUnit(saved.distanceUnit);
      update((current) => {
        if (active.kind === "duration") return { ...current, duration: saved.step.duration };
        if (active.kind === "purpose") return { ...current, purpose: saved.step.purpose };
        if (active.kind === "details")
          return {
            ...current,
            name: saved.step.name,
            notes: saved.step.notes,
            description: saved.step.description,
          };
        if (active.kind !== "target") return current;
        const targetIndex = targetKeys.indexOf(active.targetKey);
        const original = saved.step.targets[targetIndex];
        return original
          ? {
              ...current,
              targets: current.targets.map((target, index) =>
                index === targetIndex ? original : target,
              ),
            }
          : current;
      });
      if (active.kind === "duration" || active.kind === "target") {
        const key = draftKey(active);
        editing.setDrafts((drafts) => {
          const next = { ...drafts };
          if (saved.draft) next[key] = saved.draft;
          else delete next[key];
          return next;
        });
      }
    }
    const trigger = triggerId(active);
    pendingField.current = null;
    editing.setActive(null);
    document.getElementById(trigger)?.focus({ preventScroll: true });
  };
  const openField = (id: string) => {
    if (id.startsWith(`step-duration-`) || id.startsWith(`step-duration-type-`))
      activate({ stepId: step.id, kind: "duration" }, id);
    else if (id.startsWith("step-intensity-") || id.startsWith("step-target-")) {
      const suffix = id.split(`${step.id}-`)[1];
      const targetIndex = Number(suffix?.replace(/-field$/, ""));
      const targetKey = targetKeys[targetIndex];
      if (targetKey !== undefined) activate({ stepId: step.id, kind: "target", targetKey }, id);
    } else
      activate(
        { stepId: step.id, kind: id.startsWith("step-purpose-") ? "purpose" : "details" },
        id,
      );
  };
  useLayoutEffect(() => {
    editing.editors.current.set(step.id, { openField });
    return () => {
      editing.editors.current.delete(step.id);
    };
  });
  useEffect(() => {
    if (!active || !pendingField.current) return;
    const id = pendingField.current;
    pendingField.current = null;
    editorRef.current?.scrollIntoView?.({ block: "nearest", behavior: "auto" });
    if (
      active.kind === "duration" &&
      step.duration.type === "time" &&
      !id.startsWith("step-duration-type-")
    )
      durationRef.current?.focus();
    else focusEditorField(id);
  });

  const objectiveIndex = step.targets.findIndex(
    (target) => getActivityTargetRole(target) === "objective",
  );
  const primaryIndex =
    objectiveIndex >= 0
      ? objectiveIndex
      : Math.max(
          0,
          step.targets.findIndex((target) => target.type === "RPE"),
        );
  const menuFocus = useRef<string | null>(null);
  const addTarget = () => {
    const key = nextTargetKey.current++;
    setTargetKeys((keys) => [...keys, key]);
    const targetIndex = step.targets.length;
    update((item) => ({
      ...item,
      targets: [...item.targets, { type: "RPE", intensity: defaultTargetIntensity("RPE") }],
    }));
    menuFocus.current = `step-intensity-${step.id}-${targetIndex}-field`;
  };

  const renderTarget = (targetIndex: number, secondary = false) => {
    const target = step.targets[targetIndex];
    if (!target) return null;
    const targetLabel = targetIndex === 0 ? "Target" : `Target ${targetIndex + 1}`;
    const intensityLabel =
      targetIndex === 0
        ? target.type === "RPE"
          ? "RPE"
          : "Intensity"
        : `Target ${targetIndex + 1} intensity`;
    return (
      <div
        hidden={active?.kind !== "target" || active.targetKey !== targetKeys[targetIndex]}
        className="min-w-0 space-y-3"
        key={targetKeys[targetIndex]}
      >
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-center gap-2">
          {targetTypes.length === 1 && targetTypes.includes(target.type) ? (
            <span
              id={`step-target-${step.id}-${targetIndex}`}
              className="text-sm font-medium"
              tabIndex={-1}
            >
              RPE
            </span>
          ) : (
            <select
              aria-label={`${context}, ${targetLabel} metric`}
              className={`${selectClassName} h-11 min-w-0 w-full border-transparent px-1`}
              id={`step-target-${step.id}-${targetIndex}`}
              onChange={(event) => {
                const type = event.currentTarget.value as ActivityTargetType;
                if (type === target.type) return;
                // Validate the current draft in its current unit first. Revalidating an
                // invalid RPE "0" as watts would clear the draft while leaving the old dose.
                if (numericDrafts[`step-intensity-${step.id}-${targetIndex}`]) {
                  onFocusField(`step-intensity-${step.id}-${targetIndex}-field`);
                  return;
                }
                onNumericDraft(
                  `step-intensity-${step.id}-${targetIndex}`,
                  numericDrafts[`step-intensity-${step.id}-${targetIndex}`]?.value ??
                    String(target.intensity),
                  activityTargetDefinitionByType[type].minimum,
                  false,
                  type === "%MaxHR" ? 100 : activityTargetDefinitionByType[type].saveableMaximum,
                );
                update((item) => ({
                  ...item,
                  targets: item.targets.map((value, index) =>
                    index === targetIndex ? { type, intensity: value.intensity } : value,
                  ),
                }));
              }}
              value={target.type}
            >
              {!targetTypes.includes(target.type) ? (
                <option disabled value={target.type}>
                  {target.type} (needs correction)
                </option>
              ) : null}
              {activityTargetTypes
                .filter((type) => targetTypes.includes(type))
                .map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
            </select>
          )}
          {target.type === "RPE" ? (
            <fieldset className="col-span-2 min-w-0 space-y-2">
              <legend className="text-sm font-medium">Perceived effort · RPE</legend>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 19 }, (_, index) => 1 + index / 2).map(
                  (value, choiceIndex) => (
                    <label
                      key={value}
                      className="relative flex h-12 min-w-12 cursor-pointer items-center justify-center rounded-md border border-input bg-background has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                    >
                      <input
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        type="radio"
                        name={`rpe-${step.id}-${targetKeys[targetIndex]}`}
                        aria-label={`${context}, target ${targetIndex + 1}, RPE ${value}`}
                        id={
                          value === target.intensity ||
                          (choiceIndex === 0 &&
                            (!Number.isInteger(target.intensity * 2) ||
                              target.intensity < 1 ||
                              target.intensity > 10))
                            ? `step-intensity-${step.id}-${targetIndex}-field`
                            : undefined
                        }
                        checked={target.intensity === value}
                        onChange={() => {
                          onNumericDraft(
                            `step-intensity-${step.id}-${targetIndex}`,
                            String(value),
                            1,
                            false,
                            10,
                          );
                          update((item) => ({
                            ...item,
                            targets: item.targets.map((target, index) =>
                              index === targetIndex ? { ...target, intensity: value } : target,
                            ),
                          }));
                        }}
                      />
                      {value}
                    </label>
                  ),
                )}
              </div>
              {!Number.isInteger(target.intensity * 2) ||
              target.intensity < 1 ||
              target.intensity > 10 ? (
                <p role="alert" className="text-sm text-destructive">
                  Existing RPE {target.intensity} needs correction. Choose a half point from 1 to
                  10.
                </p>
              ) : null}
            </fieldset>
          ) : (
            <div className="min-w-0 [&_label]:sr-only [&_input]:h-12">
              <BoundedNumberInput
                clampProjection={false}
                {...(numericDrafts[`step-intensity-${step.id}-${targetIndex}`]
                  ? { error: "Enter a valid exact effort before saving." }
                  : {})}
                id={`step-intensity-${step.id}-${targetIndex}`}
                label={`${context}, ${intensityLabel}`}
                unitLabel={
                  target.type === "speed"
                    ? "km/h"
                    : target.type === "watts"
                      ? "W"
                      : target.type === "cadence"
                        ? "rpm"
                        : target.type
                }
                accessibilityHint={
                  target.type === "speed"
                    ? "Speed in kilometers per hour"
                    : target.type === "cadence"
                      ? "Cadence in revolutions per minute"
                      : target.type
                }
                min={activityTargetDefinitionByType[target.type].minimum}
                max={
                  target.type === "%MaxHR"
                    ? 100
                    : activityTargetDefinitionByType[target.type].saveableMaximum
                }
                onChange={(value) => {
                  const intensity = parseNumberOrUndefined(value);
                  if (
                    intensity !== undefined &&
                    !activityPlanTargetSchema.safeParse({ type: target.type, intensity }).success
                  ) {
                    editing.setDrafts((drafts) => ({
                      ...drafts,
                      [`step-intensity-${step.id}-${targetIndex}`]: {
                        value,
                        min: activityTargetDefinitionByType[target.type].minimum,
                        integer: false,
                      },
                    }));
                    return;
                  }
                  onNumericDraft(
                    `step-intensity-${step.id}-${targetIndex}`,
                    value,
                    activityTargetDefinitionByType[target.type].minimum,
                    false,
                    target.type === "%MaxHR"
                      ? 100
                      : activityTargetDefinitionByType[target.type].saveableMaximum,
                  );
                }}
                onNumberChange={(intensity) => {
                  if (intensity === undefined) return;
                  if (!activityPlanTargetSchema.safeParse({ type: target.type, intensity }).success)
                    return;
                  update((item) => ({
                    ...item,
                    targets: item.targets.map((value, index) =>
                      index === targetIndex ? { ...value, intensity } : value,
                    ),
                  }));
                }}
                value={
                  numericDrafts[`step-intensity-${step.id}-${targetIndex}`]?.value ??
                  String(target.intensity)
                }
              />
            </div>
          )}
        </div>
        {secondary ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            aria-label={`Remove target ${targetIndex + 1}`}
            onClick={() => {
              setTargetKeys((keys) => keys.filter((_, index) => index !== targetIndex));
              onRemoveTarget(targetIndex);
            }}
          >
            Remove target
          </Button>
        ) : null}
        {!targetTypes.includes(target.type) ? (
          <p className="text-sm text-destructive">
            {target.type} is incompatible. Choose a supported target and enter its value, or remove
            it. The current value is retained.
          </p>
        ) : null}
      </div>
    );
  };

  const durationSummary = numericDrafts[durationKey]
    ? "Unresolved duration"
    : step.duration.type === "time"
      ? formatDurationSeconds(step.duration.seconds)
      : step.duration.type === "distance"
        ? `${step.duration.meters >= 1000 ? step.duration.meters / 1000 : step.duration.meters} ${step.duration.meters >= 1000 ? "km" : "m"}`
        : step.duration.type === "repetitions"
          ? `${step.duration.count} reps`
          : "Until finished";
  const targetTrigger = (targetIndex: number) => {
    const target = step.targets[targetIndex];
    const targetKey = targetKeys[targetIndex];
    if (!target || targetKey === undefined) return null;
    const value = numericDrafts[`step-intensity-${step.id}-${targetIndex}`]
      ? "Unresolved effort"
      : `${target.intensity} ${target.type === "watts" ? "W" : target.type === "speed" ? "km/h" : target.type === "cadence" ? "rpm" : target.type}`;
    const selection = { stepId: step.id, kind: "target" as const, targetKey };
    return (
      <Button
        type="button"
        variant="ghost"
        className="h-auto min-h-12 min-w-12 px-2"
        key={targetKey}
        id={triggerId(selection)}
        aria-label={`${context}, target ${targetIndex + 1}: ${value}`}
        aria-expanded={active?.kind === "target" && active.targetKey === targetKey}
        onClick={() => activate(selection, `step-intensity-${step.id}-${targetIndex}-field`)}
      >
        {value}
      </Button>
    );
  };
  const customName =
    !/^Step \d+$/.test(step.name) && !["Steady effort", "Recovery"].includes(step.name)
      ? step.name
      : "";
  return (
    <fieldset
      aria-label={context}
      data-testid={`activity-plan-step-${step.id}`}
      data-selected={selected}
      onFocus={onFocus}
      onKeyDown={(event) => {
        if (event.key === "Escape" && active && !disabled && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          closeEditor(true);
        }
      }}
      className={`min-w-0 space-y-2 border-0 border-l-2 pl-3 py-3 ${selected ? "border-l-primary" : "border-l-transparent"}`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-0.5" data-testid="prescription-row">
        <Button
          type="button"
          variant="ghost"
          className="min-h-12 px-2 capitalize"
          id={triggerId({ stepId: step.id, kind: "purpose" })}
          aria-label={`${context}, purpose: ${step.purpose ?? "Choose purpose"}`}
          aria-expanded={active?.kind === "purpose"}
          onClick={() => activate({ stepId: step.id, kind: "purpose" }, `step-purpose-${step.id}`)}
        >
          {step.purpose ?? "Choose purpose"}
        </Button>
        <span aria-hidden="true" className="text-muted-foreground">
          |
        </span>
        <Button
          type="button"
          variant="ghost"
          className="h-auto min-h-12 min-w-12 px-2"
          id={triggerId({ stepId: step.id, kind: "duration" })}
          aria-label={`${context}, duration: ${durationSummary}`}
          aria-expanded={active?.kind === "duration"}
          onClick={() => activate({ stepId: step.id, kind: "duration" }, `${durationKey}-field`)}
        >
          {durationSummary}
        </Button>
        <span aria-hidden="true" className="text-muted-foreground">
          |
        </span>
        {targetTrigger(primaryIndex)}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              id={`step-add-target-${step.id}`}
              aria-label={`Step ${index + 1} actions`}
              className="h-11 w-11 shrink-0"
              size="icon"
              type="button"
              variant="ghost"
            >
              <Ellipsis className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(event) => {
              if (!menuFocus.current) return;
              event.preventDefault();
              onFocusField(menuFocus.current);
              menuFocus.current = null;
            }}
          >
            <DropdownMenuItem
              disabled={disabled}
              className="min-h-11"
              onSelect={() => {
                menuFocus.current = onDuplicate();
              }}
            >
              Duplicate step
            </DropdownMenuItem>
            {step.targets.length < (step.duration.type === "repetitions" ? 1 : 3) ? (
              <DropdownMenuItem disabled={disabled} className="min-h-11" onSelect={addTarget}>
                Add RPE target
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem disabled={disabled} className="min-h-11" onSelect={onRemove}>
              Delete step {index + 1}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div
        hidden={!active}
        ref={editorRef}
        data-testid={`step-context-editor-${step.id}`}
        aria-describedby={`step-editor-hint-${step.id}`}
        className="max-w-xl min-w-0 scroll-my-24 space-y-3 rounded-lg border border-border bg-muted/20 p-3"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">
            {active?.kind === "duration"
              ? "Duration"
              : active?.kind === "target"
                ? "Effort"
                : active?.kind === "purpose"
                  ? "Purpose"
                  : "Step details"}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label="Close editor"
            aria-describedby={`step-editor-hint-${step.id}`}
            aria-description="Close keeps entered values, including unresolved edits."
            onClick={() => closeEditor(false)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <p id={`step-editor-hint-${step.id}`} className="sr-only">
          Close keeps entered values. Escape reverts only this edit and returns focus to its value
          button.
        </p>
        <div hidden={active?.kind !== "purpose"}>
          <FieldLabel htmlFor={`step-purpose-${step.id}`}>Purpose</FieldLabel>
          <select
            aria-label={`${context}, purpose`}
            id={`step-purpose-${step.id}`}
            className={`${selectClassName} min-h-12 w-full`}
            value={step.purpose ?? ""}
            onChange={(event) => {
              const purpose = event.currentTarget.value as NonNullable<
                ActivityPlanIntervalStep["purpose"]
              >;
              update((item) => ({ ...item, purpose }));
            }}
          >
            <option value="" disabled>
              Choose purpose (required)
            </option>
            {(["warmup", "work", "recovery", "cooldown", "technique"] as const).map((purpose) => (
              <option key={purpose} value={purpose}>
                {purpose}
              </option>
            ))}
          </select>
        </div>
        <div hidden={active?.kind !== "duration"} className="min-w-0 space-y-3">
          <div className="min-w-0 space-y-3">
            {durationTypes.length === 1 &&
            durationTypes.some((type) => type === step.duration.type) ? (
              <span id={`step-duration-type-${step.id}`} tabIndex={-1} className="text-sm">
                Time
              </span>
            ) : (
              <select
                aria-label={`${context}, completion mode`}
                aria-description="Changing completion mode retains the number; enter the amount in the selected unit."
                className={`${selectClassName} h-11 min-w-0 w-full border-transparent px-1`}
                id={`step-duration-type-${step.id}`}
                onChange={(event) => {
                  const type = event.currentTarget.value as ActivityPlanDuration["type"];
                  if (numericDrafts[durationKey]) {
                    onFocusField(`${durationKey}-field`);
                    return;
                  }
                  update((item) => ({
                    ...item,
                    duration: nextDuration(type, durationAmount(item.duration)),
                  }));
                }}
                value={step.duration.type}
              >
                {!durationTypes.some((type) => type === step.duration.type) ? (
                  <option value={step.duration.type} disabled>
                    {step.duration.type} (needs correction)
                  </option>
                ) : null}
                {durationTypes.map((type) => (
                  <option key={type} value={type}>
                    {type === "time"
                      ? "Time"
                      : type === "distance"
                        ? "Distance · m"
                        : "Repetitions"}
                  </option>
                ))}
              </select>
            )}
            {step.duration.type === "time" ? (
              <div className="col-span-2">
                <SegmentedDurationField
                  ref={durationRef}
                  id={durationKey}
                  label={`${context}, duration`}
                  disabled={disabled}
                  valueSeconds={step.duration.seconds}
                  segments={
                    editing.drafts[durationKey]?.segments ??
                    splitDurationSeconds(step.duration.seconds)
                  }
                  onInvalidChange={() => {}}
                  onSegmentsChange={(segments) => {
                    const seconds = parseDurationSegments(segments);
                    editing.setDrafts((drafts) => {
                      const next = { ...drafts };
                      if (seconds === null)
                        next[durationKey] = {
                          value: Object.values(segments).join(":"),
                          min: 1,
                          integer: true,
                          segments,
                        };
                      else delete next[durationKey];
                      return next;
                    });
                  }}
                  onChangeSeconds={(seconds) =>
                    update((item) => ({ ...item, duration: { type: "time", seconds } }))
                  }
                />
              </div>
            ) : step.duration.type !== "untilFinished" ? (
              <div className="min-w-0 [&_label]:sr-only [&_input]:h-11">
                <BoundedNumberInput
                  clampProjection={false}
                  {...(numericDrafts[durationKey]
                    ? { error: "Enter a valid whole dose before saving." }
                    : {})}
                  decimals={step.duration.type === "distance" && distanceUnit === "km" ? 3 : 0}
                  id={`step-duration-${step.id}`}
                  label={`${context}, ${step.duration.type === "distance" ? "Distance" : "Repetitions"}`}
                  min={step.duration.type === "distance" && distanceUnit === "km" ? 0.001 : 1}
                  max={
                    step.duration.type === "distance"
                      ? distanceUnit === "km"
                        ? 1000
                        : 1_000_000
                      : 1000
                  }
                  onChange={(value) => {
                    const scale =
                      step.duration.type === "distance" && distanceUnit === "km" ? 1000 : 1;
                    const amount = parseNumberOrUndefined(value);
                    const max = step.duration.type === "distance" ? 1_000_000 : 1000;
                    const invalid =
                      amount === undefined ||
                      !Number.isInteger(amount * scale) ||
                      amount * scale < 1 ||
                      amount * scale > max;
                    editing.setDrafts((drafts) => {
                      const next = { ...drafts };
                      if (invalid)
                        next[durationKey] = {
                          value,
                          min: 1 / scale,
                          max: max / scale,
                          integer: scale === 1,
                        };
                      else delete next[durationKey];
                      return next;
                    });
                  }}
                  onNumberChange={(amount) => {
                    if (amount === undefined) return;
                    const canonical =
                      amount *
                      (step.duration.type === "distance" && distanceUnit === "km" ? 1000 : 1);
                    if (!Number.isInteger(canonical)) return;
                    update((item) => ({
                      ...item,
                      duration: nextDuration(item.duration.type, canonical),
                    }));
                  }}
                  value={
                    numericDrafts[durationKey]?.value ??
                    String(
                      durationAmount(step.duration) /
                        (step.duration.type === "distance" && distanceUnit === "km" ? 1000 : 1),
                    )
                  }
                />
                {step.duration.type === "distance" ? (
                  <select
                    aria-label={`${context}, distance unit`}
                    className={`${selectClassName} mt-2 min-h-12`}
                    value={distanceUnit}
                    onChange={(event) => {
                      if (!numericDrafts[durationKey])
                        setDistanceUnit(event.currentTarget.value as "m" | "km");
                      else onFocusField(`${durationKey}-field`);
                    }}
                  >
                    <option value="m">Meters</option>
                    <option value="km">Kilometers</option>
                  </select>
                ) : (
                  <span className="text-sm">reps</span>
                )}
              </div>
            ) : null}
          </div>
        </div>
        {step.targets.map((_, targetIndex) => renderTarget(targetIndex, true))}
        <div hidden={active?.kind !== "details"}>
          <div className="mt-2 grid gap-3">
            <div className="space-y-2">
              <FieldLabel htmlFor={`step-name-${step.id}`}>Custom name</FieldLabel>
              <Input
                aria-label={`${context}, name`}
                placeholder="Custom step name"
                id={`step-name-${step.id}`}
                onChange={(event) => {
                  const name = event.currentTarget.value;
                  update((item) => ({ ...item, name }));
                }}
                value={step.name}
              />
            </div>
            {step.targets[primaryIndex] ? (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 justify-self-start"
                aria-label={`Remove target ${primaryIndex + 1}`}
                onClick={() => {
                  editing.setActive(null);
                  setTargetKeys((keys) => keys.filter((_, index) => index !== primaryIndex));
                  onRemoveTarget(primaryIndex);
                }}
              >
                Remove primary target
              </Button>
            ) : null}
            <FieldLabel htmlFor={`step-instructions-${step.id}`}>Instructions</FieldLabel>
            <Textarea
              aria-label={`${context}, instructions`}
              id={`step-instructions-${step.id}`}
              maxLength={1000}
              onChange={(event) => {
                const notes = event.currentTarget.value;
                update((item) => ({ ...item, notes, description: undefined }));
              }}
              value={instructions}
            />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {step.targets.map((_, targetIndex) =>
          targetIndex === primaryIndex ? null : targetTrigger(targetIndex),
        )}
        <Button
          type="button"
          variant="ghost"
          id={triggerId({ stepId: step.id, kind: "details" })}
          className="h-auto min-h-11 max-w-full justify-start whitespace-normal px-2 text-left text-sm text-muted-foreground"
          aria-label={`${context}, details`}
          aria-expanded={active?.kind === "details"}
          onClick={() => activate({ stepId: step.id, kind: "details" }, `step-name-${step.id}`)}
        >
          {[customName, instructions ? `Instructions: ${instructions}` : ""]
            .filter(Boolean)
            .join(" · ") || "Add name or instructions"}
        </Button>
      </div>
    </fieldset>
  );
}
