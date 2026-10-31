import type {
  ActivityPlanDraftItem,
  ActivityPlanDraftRepeat,
  ActivityPlanDraftStep,
  ActivityPlanDraftStructure,
  ActivityPlanDuration,
  ActivityPlanStructure,
  ActivityPlanTrainingIntent,
  ActivityTargetType,
  CanonicalActivityCategory,
} from "@repo/core";
import {
  activityPlanDraftMetrics,
  activityPlanStepNoteSchema,
  createUnavailableAthletePerformanceTargetFacts,
  normalizeActivityPlanAuthoringStructure,
  resolveActivityPlanDraft,
} from "@repo/core";
import { getPermissibleActivityPlanDurationTypes } from "@repo/core/activity-plan";
import {
  activityTargetAuthoringUnitLabels,
  activityTargetDefinitionByType,
  getPermissibleTargetTypes,
} from "@repo/core/targets";
import { parseNumericInput } from "@repo/core/utils/numeric-ux-policy";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import { Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createActivityPlanRepeat,
  createActivityPlanStep,
  createActivityPlanStructure,
  duplicateDraftItem,
  insertDraftItem,
  moveDraftItem,
  removeDraftItem,
  ungroupDraftRepeat,
  updateActivityPlanRepeat,
  updateActivityPlanStep,
} from "../../lib/activity-plan-authoring";
import { ActivityPlanEstimateRow } from "./activity-plan-estimates";
import { formatActivityPlanDuration } from "./activity-plan-structure-presentation";
import { ActivityPlanTimelineChart } from "./activity-plan-timeline-chart";

const categories = ["run", "bike", "swim", "strength", "other"] as const;
const visibilityOptions = ["private", "followers", "public"] as const;
type RawDrafts = Record<string, string>;

export type ActivityPlanAuthoringValues = {
  description: string | null;
  gps_recording_enabled: boolean;
  name: string;
  notes: null;
  structure: ActivityPlanStructure;
  training_intent?: ActivityPlanTrainingIntent;
  content_visibility: (typeof visibilityOptions)[number];
};
type Props = {
  initial?: {
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

function key(stepId: string, targetIndex?: number) {
  return `${stepId}:${targetIndex ?? "quantity"}`;
}
function completionTypeKey(stepId: string) {
  return `${stepId}:completion-type`;
}
function targetDraftKey(stepId: string, targetIndex: number) {
  return key(stepId, targetIndex);
}
function removeTargetDraft(drafts: RawDrafts, stepId: string, targetIndex: number) {
  const next: RawDrafts = {};
  const prefix = `${stepId}:`;
  for (const [draftKey, value] of Object.entries(drafts)) {
    if (!draftKey.startsWith(prefix)) {
      next[draftKey] = value;
      continue;
    }
    const index = Number(draftKey.slice(prefix.length));
    if (!Number.isInteger(index) || index < 0) next[draftKey] = value;
    else if (index < targetIndex) next[draftKey] = value;
    else if (index > targetIndex) next[targetDraftKey(stepId, index - 1)] = value;
  }
  return next;
}
function removeStepDrafts(drafts: RawDrafts, stepId: string) {
  return Object.fromEntries(
    Object.entries(drafts).filter(([draftKey]) => !draftKey.startsWith(`${stepId}:`)),
  );
}
function removeRepeatDrafts(drafts: RawDrafts, repeat: ActivityPlanDraftRepeat) {
  return repeat.steps.reduce((next, step) => removeStepDrafts(next, step.id), drafts);
}
function durationAmount(duration: NonNullable<ActivityPlanDraftStep["duration"]>) {
  return duration.type === "time"
    ? duration.seconds
    : duration.type === "distance"
      ? duration.meters
      : duration.type === "repetitions"
        ? duration.count
        : 1;
}
function durationFrom(type: ActivityPlanDuration["type"], value: number): ActivityPlanDuration {
  if (type === "time") return { type, seconds: value };
  if (type === "distance") return { type, meters: value };
  if (type === "repetitions") return { type, count: value };
  return { type: "untilFinished" };
}
function numericError(raw: string) {
  const value = parseNumericInput(raw, {
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
    precision: "integer",
  });
  return value.status === "valid"
    ? null
    : value.status === "empty"
      ? "A value is required."
      : "Enter a positive whole number.";
}
function targetError(type: ActivityTargetType, raw: string) {
  if (type === "rest") return null;
  const definition = activityTargetDefinitionByType[type];
  const result = parseNumericInput(raw, {
    min:
      definition.minimum +
      ("exclusiveMinimum" in definition && definition.exclusiveMinimum ? Number.EPSILON : 0),
    max: definition.saveableMaximum,
    precision:
      type === "speed"
        ? { maxDecimalPlaces: 2 }
        : type === "RPE"
          ? { maxDecimalPlaces: 1 }
          : "integer",
  });
  if (result.status !== "valid")
    return result.status === "empty" ? "A value is required." : "Enter a valid target value.";
  return type === "RPE" && !Number.isInteger(result.value * 2)
    ? "RPE must use whole or half-point increments."
    : null;
}

/** Local draft state is permissive; only Core's resolver yields the strict saved V5 structure. */
export function ActivityPlanComposer({
  initial,
  mode,
  onCancel,
  onSave,
  onSaved,
  pending = false,
}: Props) {
  const initialResolution = initial ? resolveActivityPlanDraft(initial.structure) : null;
  const initialStructure =
    initialResolution?.status === "valid" ? initialResolution.structure : null;
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? initial?.notes ?? "");
  const [descriptionOpen, setDescriptionOpen] = useState(
    Boolean(initial?.description ?? initial?.notes),
  );
  const [visibility, setVisibility] = useState<ActivityPlanAuthoringValues["content_visibility"]>(
    initial?.content_visibility === "public" || initial?.content_visibility === "followers"
      ? initial.content_visibility
      : "private",
  );
  const [gpsEnabled, setGpsEnabled] = useState(initial?.gps_recording_enabled ?? true);
  const [structure, setStructureState] = useState<ActivityPlanDraftStructure>(
    initialStructure ?? createActivityPlanStructure(),
  );
  const [drafts, setDrafts] = useState<RawDrafts>({});
  const [activeStepId, setActiveStepId] = useState<string | null>(
    initialStructure?.items.flatMap((item) => (item.type === "step" ? [item] : item.steps))[0]
      ?.id ?? null,
  );
  const [requestedCategory, setRequestedCategory] = useState<CanonicalActivityCategory | null>(
    null,
  );
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const structureRef = useRef(structure);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const setStructure: React.Dispatch<React.SetStateAction<ActivityPlanDraftStructure>> = (
    action,
  ) => {
    try {
      const next = typeof action === "function" ? action(structureRef.current) : action;
      structureRef.current = next;
      setStructureState(next);
      setError(null);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "This activity plan change could not be applied.",
      );
    }
  };
  const dropAt = (repeatId: string | undefined, index: number) => {
    if (!draggingId) return;
    const sourceId = draggingId;
    setDraggingId(null);
    setStructure((current) => {
      const rootIndex = current.items.findIndex((item) => item.id === sourceId);
      const parentIndex = current.items.findIndex(
        (item) => item.type === "repeat" && item.steps.some((step) => step.id === sourceId),
      );
      const parent = current.items[parentIndex];
      let destination = index;
      if (!repeatId && rootIndex >= 0 && rootIndex < index) destination--;
      if (parent?.type === "repeat") {
        const childIndex = parent.steps.findIndex((step) => step.id === sourceId);
        if (repeatId === parent.id && childIndex < index) destination--;
        if (!repeatId && parent.steps.length === 1 && parentIndex < index) destination--;
      }
      return moveDraftItem(current, sourceId, {
        ...(repeatId ? { repeatId } : {}),
        index: destination,
      });
    });
  };
  const [postSaveError, setPostSaveError] = useState<string | null>(null);
  const [lastResolved, setLastResolved] = useState<ActivityPlanStructure | null>(initialStructure);
  const inFlight = useRef(false);
  const persisted = useRef(false);
  const alive = useRef(true);
  const session = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  const facts = useMemo(
    () => createUnavailableAthletePerformanceTargetFacts(new Date().toISOString()),
    [],
  );
  const resolution = useMemo(() => resolveActivityPlanDraft(structure), [structure]);
  useEffect(() => {
    if (resolution.status === "valid") setLastResolved(resolution.structure);
  }, [resolution]);
  useEffect(() => {
    // React Strict Mode probes setup/cleanup once; the current mount must become live again.
    alive.current = true;
    return () => {
      alive.current = false;
      session.current += 1;
    };
  }, []);
  const metrics = useMemo(
    () =>
      activityPlanDraftMetrics(
        resolution.status === "valid" ? resolution.structure : lastResolved,
        facts,
      ),
    [facts, lastResolved, resolution],
  );
  const steps = structure.items.flatMap((item) => (item.type === "step" ? [item] : item.steps));
  const rawErrors = useMemo(
    () => [
      ...structure.items.flatMap((item) =>
        item.type === "repeat" &&
        parseNumericInput(drafts[`${item.id}:count`] ?? String(item.count), {
          min: 2,
          max: 50,
          precision: "integer",
        }).status !== "valid"
          ? ["Repeat count must be a whole number between 2 and 50."]
          : [],
      ),
      ...steps.flatMap((step) => [
        ...(step.duration === null
          ? ["Choose a completion condition."]
          : step.duration.type !== "untilFinished" &&
              numericError(drafts[key(step.id)] ?? String(durationAmount(step.duration)))
            ? ["Completion quantity needs repair."]
            : []),
        ...step.targets.flatMap((target, index) =>
          target.type !== "rest" &&
          (target.intensity === null ||
            targetError(target.type, drafts[key(step.id, index)] ?? String(target.intensity)))
            ? ["Target needs repair."]
            : [],
        ),
      ]),
    ],
    [drafts, steps, structure.items],
  );
  const valid = resolution.status === "valid" && rawErrors.length === 0;
  const busy = pending || saving;
  useEffect(() => {
    if (submitAttempted && !valid)
      formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
  }, [submitAttempted, valid]);
  const updateStep = (
    stepId: string,
    update: (step: ActivityPlanDraftStep) => ActivityPlanDraftStep,
  ) => setStructure((current) => updateActivityPlanStep(current, stepId, update));
  const changeCategory = (next: CanonicalActivityCategory) => {
    if (next === structure.activity_category) return;
    const incompatible = structure.items.some((item) =>
      (item.type === "step" ? [item] : item.steps).some(
        (step) =>
          (step.duration &&
            step.duration.type !== "untilFinished" &&
            !getPermissibleActivityPlanDurationTypes(next).includes(step.duration.type)) ||
          step.targets.some((target) => !getPermissibleTargetTypes(next).includes(target.type)),
      ),
    );
    if (incompatible) setRequestedCategory(next);
    else setStructure((current) => ({ ...current, activity_category: next }));
  };
  const save = async () => {
    if (inFlight.current || busy) return;
    setSubmitAttempted(true);
    if (persisted.current || !name.trim() || !valid || resolution.status !== "valid") return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    setPostSaveError(null);
    const currentSession = session.current;
    try {
      const normalized = normalizeActivityPlanAuthoringStructure(resolution.structure);
      if (!normalized.success) {
        setError(normalized.message);
        return;
      }
      await onSave({
        name: name.trim(),
        description: description.trim() || null,
        notes: null,
        structure: normalized.structure,
        gps_recording_enabled: gpsEnabled,
        content_visibility: visibility,
        ...(initial?.training_intent ? { training_intent: initial.training_intent } : {}),
      });
      if (!alive.current || session.current !== currentSession) return;
      // Persistence is durable once onSave resolves. Retry only the post-save effect.
      persisted.current = true;
      try {
        await onSaved?.();
      } catch (cause) {
        if (alive.current && session.current === currentSession)
          setPostSaveError(
            cause instanceof Error ? cause.message : "Saved, but navigation could not continue.",
          );
      }
    } catch (cause) {
      if (alive.current && session.current === currentSession)
        setError(cause instanceof Error ? cause.message : "Activity plan could not be saved.");
    } finally {
      inFlight.current = false;
      if (alive.current && session.current === currentSession) setSaving(false);
    }
  };
  const retryNavigation = async () => {
    if (inFlight.current || !persisted.current) return;
    inFlight.current = true;
    setSaving(true);
    setPostSaveError(null);
    const currentSession = session.current;
    try {
      await onSaved?.();
    } catch (cause) {
      if (alive.current && session.current === currentSession)
        setPostSaveError(
          cause instanceof Error ? cause.message : "Saved, but navigation could not continue.",
        );
    } finally {
      inFlight.current = false;
      if (alive.current && session.current === currentSession) setSaving(false);
    }
  };
  if (initial && !initialStructure)
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <p>This plan has an unsupported activity structure. It was not changed.</p>
          <Button type="button" onClick={onCancel}>
            Back to plan
          </Button>
        </CardContent>
      </Card>
    );
  return (
    <form
      className="space-y-6"
      data-testid="activity-plan-composer"
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset className="space-y-5 border-0 p-0" disabled={busy || persisted.current}>
        <section className="space-y-3" aria-label="Plan details">
          <label className="block text-sm font-medium" htmlFor="activity-plan-category">
            Activity category
          </label>
          <select
            id="activity-plan-category"
            className="h-10 w-full rounded-md border bg-background px-3"
            value={structure.activity_category ?? ""}
            onChange={(event) => {
              if (event.target.value)
                changeCategory(event.target.value as CanonicalActivityCategory);
            }}
          >
            <option value="">Choose an activity</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <label className="block text-sm font-medium" htmlFor="activity-plan-name">
            Plan name
          </label>
          <Input
            id="activity-plan-name"
            required
            maxLength={255}
            aria-invalid={submitAttempted && !name.trim()}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {submitAttempted && !name.trim() ? (
            <p className="text-sm text-destructive">Enter a plan name before saving.</p>
          ) : null}
          {descriptionOpen ? (
            <>
              <label className="block text-sm font-medium" htmlFor="activity-plan-description">
                Description
              </label>
              <Textarea
                id="activity-plan-description"
                maxLength={3000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDescriptionOpen(true)}
            >
              Add description
            </Button>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm" htmlFor="activity-plan-visibility">
              Visibility
            </label>
            <select
              id="activity-plan-visibility"
              className="h-9 rounded border bg-background px-2"
              value={visibility}
              onChange={(event) =>
                setVisibility(
                  event.target.value as ActivityPlanAuthoringValues["content_visibility"],
                )
              }
            >
              {visibilityOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <label className="text-sm" htmlFor="activity-plan-gps">
              <input
                id="activity-plan-gps"
                type="checkbox"
                checked={gpsEnabled}
                onChange={(event) => setGpsEnabled(event.target.checked)}
              />{" "}
              GPS recording enabled
            </label>
          </div>
        </section>
        {requestedCategory ? (
          <div role="alert" className="space-y-2 rounded border border-destructive/40 p-3 text-sm">
            <p>
              Some completion conditions or targets are not available for {requestedCategory}. Keep
              them and repair each item before saving?
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setStructure((current) => ({ ...current, activity_category: requestedCategory }));
                setRequestedCategory(null);
              }}
            >
              Keep and repair
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setRequestedCategory(null)}
            >
              Cancel
            </Button>
          </div>
        ) : null}
        <section aria-label="Activity plan composition" className="space-y-4">
          <ActivityPlanEstimateRow metrics={metrics} />
          {structure.activity_category ? (
            <ActivityPlanTimelineChart
              label="Plan timeline"
              presentation={null}
              structure={lastResolved ?? undefined}
              testIDPrefix="activity-plan-draft-timeline"
            />
          ) : null}
          <ol aria-label="Activity plan structure" className="space-y-3">
            {structure.items.map((item, index) => (
              <ItemEditor
                key={item.id}
                item={item}
                index={index}
                category={structure.activity_category}
                activeStepId={activeStepId}
                drafts={drafts}
                setDrafts={setDrafts}
                onActiveStepChange={setActiveStepId}
                onStructureChange={setStructure}
                onStepChange={updateStep}
                allItems={structure.items}
                draggingId={draggingId}
                onDraggingChange={setDraggingId}
                onDropAt={dropAt}
                canDuplicate={rawErrors.length === 0}
              />
            ))}
            {draggingId ? (
              <li>
                <DropTarget
                  label="Drop at end of activity plan"
                  onDrop={() => dropAt(undefined, structure.items.length)}
                />
              </li>
            ) : null}
          </ol>
          {structure.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Choose an activity, then add a step or repeat.
            </p>
          ) : null}
          <div className="sticky bottom-0 z-10 flex gap-2 border-t bg-background py-3">
            <Button
              type="button"
              variant="outline"
              disabled={!structure.activity_category}
              onClick={() => {
                const step = createActivityPlanStep();
                setStructure((current) =>
                  insertDraftItem(current, step, { index: current.items.length }),
                );
                setActiveStepId(step.id);
              }}
            >
              <Plus className="h-4 w-4" /> Add step
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!structure.activity_category}
              onClick={() =>
                setStructure((current) =>
                  insertDraftItem(current, createActivityPlanRepeat(), {
                    index: current.items.length,
                  }),
                )
              }
            >
              <Plus className="h-4 w-4" /> Add repeat
            </Button>
          </div>
        </section>
        {!valid && submitAttempted ? (
          <div
            role="alert"
            className="rounded border border-destructive/40 p-3 text-sm text-destructive"
          >
            {resolution.status === "invalid"
              ? resolution.issues.map((issue) => <p key={issue}>{issue}</p>)
              : null}
            {[...new Set(rawErrors)].map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </fieldset>
      {postSaveError ? (
        <div role="alert" className="text-sm text-destructive">
          {postSaveError}{" "}
          <Button type="button" size="sm" disabled={saving} onClick={() => void retryNavigation()}>
            Retry navigation
          </Button>
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            session.current += 1;
            setSaving(false);
            setError(null);
            setPostSaveError(null);
            onCancel();
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy || persisted.current || !name.trim() || !valid}>
          {saving ? "Saving..." : mode === "edit" ? "Save changes" : "Create plan"}
        </Button>
      </div>
    </form>
  );
}

function ItemEditor({
  item,
  index,
  category,
  activeStepId,
  drafts,
  setDrafts,
  onActiveStepChange,
  onStructureChange,
  onStepChange,
  allItems,
  draggingId,
  onDraggingChange,
  onDropAt,
  canDuplicate,
}: {
  item: ActivityPlanDraftItem;
  index: number;
  category: CanonicalActivityCategory | null;
  activeStepId: string | null;
  drafts: RawDrafts;
  setDrafts: React.Dispatch<React.SetStateAction<RawDrafts>>;
  onActiveStepChange: (id: string | null) => void;
  onStructureChange: React.Dispatch<React.SetStateAction<ActivityPlanDraftStructure>>;
  onStepChange: (
    id: string,
    update: (step: ActivityPlanDraftStep) => ActivityPlanDraftStep,
  ) => void;
  allItems: ActivityPlanDraftItem[];
  draggingId: string | null;
  onDraggingChange: (id: string | null) => void;
  onDropAt: (repeatId: string | undefined, index: number) => void;
  canDuplicate: boolean;
}) {
  const isRepeat = item.type === "repeat";
  const itemSteps = isRepeat ? item.steps : [item];
  const move = (id: string, repeatId: string | undefined, targetIndex: number) =>
    onStructureChange((current) =>
      moveDraftItem(current, id, { ...(repeatId ? { repeatId } : {}), index: targetIndex }),
    );
  return (
    <li className="rounded-xl border p-4" data-testid={`activity-plan-item-${index}`}>
      {draggingId ? (
        <DropTarget
          label={`Drop before item ${index + 1}`}
          onDrop={() => onDropAt(undefined, index)}
        />
      ) : null}
      {isRepeat ? (
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">
            {isRepeat ? `Repeat ${index + 1}` : `Step ${index + 1}`}
          </h3>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              draggable
              aria-label={`Drag repeat ${index + 1}`}
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", item.id);
                event.dataTransfer.effectAllowed = "move";
                onDraggingChange(item.id);
              }}
              onDragEnd={() => onDraggingChange(null)}
            >
              <GripVertical className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label="Move item earlier"
              onClick={() => move(item.id, undefined, index - 1)}
            >
              ↑
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label="Move item later"
              onClick={() => move(item.id, undefined, index + 1)}
            >
              ↓
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label="Duplicate item"
              disabled={!canDuplicate}
              title={!canDuplicate ? "Correct incomplete fields before duplicating." : undefined}
              onClick={() => onStructureChange((current) => duplicateDraftItem(current, item.id))}
            >
              <Copy className="h-4 w-4" />
            </Button>
            {isRepeat ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Ungroup repeat"
                disabled={!canDuplicate}
                onClick={() => onStructureChange((current) => ungroupDraftRepeat(current, item.id))}
              >
                Ungroup
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label="Delete item"
              onClick={() => {
                if (
                  isRepeat &&
                  item.steps.length > 0 &&
                  !window.confirm(
                    "Delete this repeat and all its steps? Use Ungroup to keep the full sequence.",
                  )
                )
                  return;
                setDrafts((current) => removeRepeatDrafts(current, item));
                onStructureChange((current) => removeDraftItem(current, item.id));
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
      {isRepeat ? (
        <label className="mt-3 block text-sm" htmlFor={`repeat-count-${item.id}`}>
          Repeat count
          <Input
            id={`repeat-count-${item.id}`}
            className="mt-1 max-w-24"
            type="text"
            inputMode="numeric"
            value={drafts[`${item.id}:count`] ?? String(item.count)}
            aria-invalid={
              parseNumericInput(drafts[`${item.id}:count`] ?? String(item.count), {
                min: 2,
                max: 50,
                precision: "integer",
              }).status !== "valid"
            }
            onChange={(event) => {
              const raw = event.target.value;
              setDrafts((current) => ({ ...current, [`${item.id}:count`]: raw }));
              const parsed = parseNumericInput(event.target.value, {
                min: 2,
                max: 50,
                precision: "integer",
              });
              if (parsed.status === "valid")
                onStructureChange((current) =>
                  updateActivityPlanRepeat(current, item.id, (repeat) => ({
                    ...repeat,
                    count: parsed.value,
                  })),
                );
            }}
          />
          {parseNumericInput(drafts[`${item.id}:count`] ?? String(item.count), {
            min: 2,
            max: 50,
            precision: "integer",
          }).status !== "valid" ? (
            <span role="alert">Enter a whole repeat count from 2 to 50.</span>
          ) : null}
        </label>
      ) : null}
      <ol
        aria-label={isRepeat ? `Repeat ${index + 1} steps` : `Step ${index + 1}`}
        className="mt-3 space-y-2"
      >
        {itemSteps.map((step, stepIndex) => (
          <li
            key={step.id}
            id={`activity-plan-step-${step.id}`}
            className="rounded-lg bg-muted/30 p-3"
          >
            {draggingId && isRepeat ? (
              <DropTarget
                label={`Drop before step ${stepIndex + 1} in repeat ${index + 1}`}
                onDrop={() => onDropAt(item.id, stepIndex)}
              />
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <div>
                <span>{step.name || `Step ${isRepeat ? stepIndex + 1 : index + 1}`}</span>
                <p className="text-sm text-muted-foreground">
                  {step.duration ? formatActivityPlanDuration(step.duration) : "Set duration"}
                  {step.targets.length
                    ? ` · ${step.targets.map((target) => (target.type === "rest" ? "Rest" : `${target.intensity ?? "Set"} ${activityTargetAuthoringUnitLabels[activityTargetDefinitionByType[target.type].unit]}`)).join(", ")}`
                    : ""}
                </p>
              </div>
              <StepActions
                index={isRepeat ? stepIndex : index}
                stepId={step.id}
                editing={activeStepId === step.id}
                onEdit={() => onActiveStepChange(activeStepId === step.id ? null : step.id)}
                onDelete={() => {
                  setDrafts((current) => removeStepDrafts(current, step.id));
                  onStructureChange((current) => removeDraftItem(current, step.id));
                }}
                onDuplicate={() =>
                  onStructureChange((current) => duplicateDraftItem(current, step.id))
                }
                canDuplicate={canDuplicate}
                onMove={(offset) =>
                  move(
                    step.id,
                    isRepeat ? item.id : undefined,
                    (isRepeat ? stepIndex : index) + offset,
                  )
                }
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", step.id);
                  event.dataTransfer.effectAllowed = "move";
                  onDraggingChange(step.id);
                }}
                onDragEnd={() => onDraggingChange(null)}
              />
            </div>
            <label className="mt-2 block text-sm">
              Move {step.name || `step ${isRepeat ? stepIndex + 1 : index + 1}`} to
              <select
                className="ml-2 rounded border bg-background p-1"
                value=""
                onChange={(event) => {
                  const destination = event.target.value;
                  if (!destination) return;
                  if (destination === "root")
                    move(
                      step.id,
                      undefined,
                      allItems.length - (isRepeat && item.steps.length > 1 ? 0 : 1),
                    );
                  else {
                    const repeat = allItems.find(
                      (candidate) => candidate.type === "repeat" && candidate.id === destination,
                    );
                    if (repeat?.type === "repeat") move(step.id, repeat.id, repeat.steps.length);
                  }
                }}
              >
                <option value="">Choose destination</option>
                <option value="root">End of activity plan</option>
                {allItems.map((candidate, repeatIndex) =>
                  candidate.type === "repeat" && (!isRepeat || candidate.id !== item.id) ? (
                    <option key={candidate.id} value={candidate.id}>
                      Repeat {repeatIndex + 1}
                    </option>
                  ) : null,
                )}
              </select>
            </label>
            {activeStepId === step.id ? (
              <StepEditor
                step={step}
                category={category}
                drafts={drafts}
                setDrafts={setDrafts}
                onChange={(update) => onStepChange(step.id, update)}
              />
            ) : null}
          </li>
        ))}
      </ol>
      {draggingId && isRepeat ? (
        <DropTarget
          label={`Drop at end of repeat ${index + 1}`}
          onDrop={() => onDropAt(item.id, item.steps.length)}
        />
      ) : null}
      {isRepeat ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => {
            const step = createActivityPlanStep();
            onStructureChange((current) =>
              insertDraftItem(current, step, { repeatId: item.id, index: item.steps.length }),
            );
            onActiveStepChange(step.id);
          }}
        >
          <Plus className="h-4 w-4" /> Add step
        </Button>
      ) : null}
    </li>
  );
}

function StepActions({
  index,
  stepId,
  editing,
  onEdit,
  onDelete,
  onDuplicate,
  onMove,
  onDragStart,
  onDragEnd,
  canDuplicate,
}: {
  index: number;
  stepId: string;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (offset: -1 | 1) => void;
  onDragStart: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  canDuplicate: boolean;
}) {
  return (
    <div className="flex items-center justify-center gap-1">
      <Button
        aria-label={`${editing ? "Close editor for" : "Edit"} step ${index + 1}`}
        aria-controls={`step-editor-${stepId}`}
        aria-expanded={editing}
        onClick={onEdit}
        size="sm"
        type="button"
        variant="ghost"
      >
        {editing ? "Close" : "Edit"}
      </Button>
      <Button
        aria-label={`Drag step ${index + 1}`}
        className="cursor-grab"
        draggable
        onDragEnd={onDragEnd}
        onDragStart={onDragStart}
        onKeyDown={(event) => {
          if (event.altKey && event.key === "ArrowUp") {
            event.preventDefault();
            onMove(-1);
          }
          if (event.altKey && event.key === "ArrowDown") {
            event.preventDefault();
            onMove(1);
          }
        }}
        size="sm"
        type="button"
        variant="ghost"
      >
        <GripVertical className="h-4 w-4" />
      </Button>
      <Button
        aria-label={`Move step ${index + 1} earlier`}
        onClick={() => onMove(-1)}
        size="sm"
        type="button"
        variant="ghost"
      >
        ↑
      </Button>
      <Button
        aria-label={`Move step ${index + 1} later`}
        onClick={() => onMove(1)}
        size="sm"
        type="button"
        variant="ghost"
      >
        ↓
      </Button>
      <Button
        aria-label="Duplicate step"
        disabled={!canDuplicate}
        title={!canDuplicate ? "Correct incomplete fields before duplicating." : undefined}
        onClick={onDuplicate}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Copy className="h-4 w-4" />
      </Button>
      <Button aria-label="Delete step" onClick={onDelete} size="sm" type="button" variant="ghost">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function DropTarget({ label, onDrop }: { label: string; onDrop: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="my-2 w-full border-dashed"
      aria-label={label}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDrop();
      }}
      onClick={onDrop}
    >
      {label}
    </Button>
  );
}

function StepEditor({
  step,
  category,
  drafts,
  setDrafts,
  onChange,
}: {
  step: ActivityPlanDraftStep;
  category: CanonicalActivityCategory | null;
  drafts: RawDrafts;
  setDrafts: React.Dispatch<React.SetStateAction<RawDrafts>>;
  onChange: (update: (step: ActivityPlanDraftStep) => ActivityPlanDraftStep) => void;
}) {
  const [nameOpen, setNameOpen] = useState(Boolean(step.name));
  const [instructionsOpen, setInstructionsOpen] = useState(Boolean(step.instructions));
  const [notePasteError, setNotePasteError] = useState<string | null>(null);
  const noteValidation = activityPlanStepNoteSchema.safeParse(step.instructions);
  const noteError =
    notePasteError ?? (noteValidation.success ? null : noteValidation.error.issues[0]?.message);
  const durations = category ? getPermissibleActivityPlanDurationTypes(category) : [];
  const targets = category ? getPermissibleTargetTypes(category) : [];
  const quantityKey = key(step.id);
  const selectedDurationType = step.duration?.type ?? drafts[completionTypeKey(step.id)] ?? "";
  const durationUnavailable =
    selectedDurationType !== "" &&
    !durations.includes(
      selectedDurationType as Exclude<ActivityPlanDuration["type"], "untilFinished">,
    );
  const durationErrorId = `step-completion-error-${step.id}`;
  const quantityRaw = step.duration
    ? (drafts[quantityKey] ?? String(durationAmount(step.duration)))
    : "";
  return (
    <fieldset id={`step-editor-${step.id}`} className="mt-3 space-y-3 border-t pt-3">
      <legend className="sr-only">Edit step</legend>
      {nameOpen ? (
        <label className="block text-sm" htmlFor={`step-name-${step.id}`}>
          Name (optional)
          <Input
            id={`step-name-${step.id}`}
            value={step.name ?? ""}
            onChange={(event) =>
              onChange((item) => ({ ...item, name: event.target.value || undefined }))
            }
          />
        </label>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setNameOpen(true)}>
          Add name
        </Button>
      )}
      {instructionsOpen ? (
        <div className="block text-sm">
          <label htmlFor={`step-instructions-${step.id}`}>Instructions (optional)</label>
          <Input
            id={`step-instructions-${step.id}`}
            value={step.instructions ?? ""}
            placeholder="One short cue, up to 160 characters"
            aria-invalid={Boolean(noteError)}
            aria-describedby={`step-instructions-help-${step.id}`}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
            onPaste={(event) => {
              const pasted = activityPlanStepNoteSchema.safeParse(
                event.clipboardData.getData("text"),
              );
              if (!pasted.success) {
                event.preventDefault();
                setNotePasteError(
                  pasted.error.issues[0]?.message ?? "Paste a short single-line cue.",
                );
              }
            }}
            onChange={(event) => {
              setNotePasteError(null);
              onChange((item) => ({ ...item, instructions: event.target.value || undefined }));
            }}
          />
          <span id={`step-instructions-help-${step.id}`} role={noteError ? "alert" : undefined}>
            {noteError ??
              "One line, up to 160 characters. Put details in the activity plan description."}
          </span>
        </div>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setInstructionsOpen(true)}>
          Add instructions
        </Button>
      )}
      <label className="block text-sm" htmlFor={`step-completion-${step.id}`}>
        Completion
        <select
          id={`step-completion-${step.id}`}
          className="mt-1 h-10 w-full rounded border bg-background px-2"
          aria-describedby={durationUnavailable ? durationErrorId : undefined}
          aria-invalid={durationUnavailable}
          value={selectedDurationType}
          onChange={(event) => {
            const type = event.target.value as ActivityPlanDuration["type"] | "";
            setDrafts((current) => ({ ...current, [completionTypeKey(step.id)]: type }));
            onChange((item) => ({
              ...item,
              duration: type === "untilFinished" ? durationFrom(type, 1) : null,
            }));
          }}
        >
          <option value="">Choose completion</option>
          {durationUnavailable ? (
            <option value={selectedDurationType}>
              {selectedDurationType} (not available for {category})
            </option>
          ) : null}
          {durations.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        {durationUnavailable ? (
          <p id={durationErrorId} className="mt-1 text-sm text-destructive">
            This completion condition is not available for {category}. Choose an available
            condition.
          </p>
        ) : null}
      </label>
      {selectedDurationType && selectedDurationType !== "untilFinished" ? (
        <label className="block text-sm" htmlFor={`step-quantity-${step.id}`}>
          Quantity
          <Input
            id={`step-quantity-${step.id}`}
            type="text"
            inputMode="numeric"
            value={quantityRaw}
            aria-invalid={Boolean(numericError(quantityRaw))}
            onChange={(event) => {
              const raw = event.target.value;
              setDrafts((current) => ({ ...current, [quantityKey]: raw }));
              const parsed = parseNumericInput(raw, { min: 1, precision: "integer" });
              if (parsed.status === "valid")
                onChange((item) => ({
                  ...item,
                  duration: durationFrom(
                    selectedDurationType as Exclude<ActivityPlanDuration["type"], "untilFinished">,
                    parsed.value,
                  ),
                }));
            }}
          />
        </label>
      ) : null}
      <div className="space-y-2">
        <span className="text-sm font-medium">Targets</span>
        {step.targets.map((target, index) => {
          const targetKey = targetDraftKey(step.id, index);
          const raw =
            drafts[targetKey] ??
            (target.type === "rest" || target.intensity === null ? "" : String(target.intensity));
          const definition = activityTargetDefinitionByType[target.type];
          return (
            <div className="flex flex-wrap items-center gap-2" key={targetKey}>
              <select
                aria-label={`Target type ${index + 1}`}
                className="h-10 rounded border bg-background px-2"
                value={target.type}
                onChange={(event) => {
                  const type = event.target.value as ActivityTargetType;
                  onChange((item) =>
                    type === "rest"
                      ? {
                          ...item,
                          duration:
                            item.duration?.type === "time"
                              ? item.duration
                              : { type: "time", seconds: 60 },
                          targets: [{ type: "rest" }],
                        }
                      : {
                          ...item,
                          targets: item.targets.map((value, itemIndex) =>
                            itemIndex === index ? { type, intensity: null } : value,
                          ),
                        },
                  );
                }}
              >
                {!targets.includes(target.type) ? (
                  <option value={target.type}>
                    {target.type} (not available for {category})
                  </option>
                ) : null}
                {targets.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              {target.type === "rest" ? null : (
                <Input
                  aria-label={`Target intensity ${index + 1}`}
                  className="max-w-40"
                  type="text"
                  inputMode="decimal"
                  value={raw}
                  aria-invalid={Boolean(targetError(target.type, raw))}
                  onChange={(event) => {
                    const next = event.target.value;
                    setDrafts((current) => ({ ...current, [targetKey]: next }));
                    const activeDefinition = activityTargetDefinitionByType[target.type];
                    const parsed = parseNumericInput(next, {
                      min: activeDefinition.minimum,
                      max: activeDefinition.saveableMaximum,
                      precision:
                        target.type === "speed"
                          ? { maxDecimalPlaces: 2 }
                          : target.type === "RPE"
                            ? { maxDecimalPlaces: 1 }
                            : "integer",
                    });
                    if (parsed.status === "valid")
                      onChange((item) => ({
                        ...item,
                        targets: item.targets.map((value, itemIndex) =>
                          itemIndex === index ? { ...value, intensity: parsed.value } : value,
                        ),
                      }));
                  }}
                />
              )}
              {target.type === "rest" ? null : (
                <span className="text-sm text-muted-foreground">
                  {activityTargetAuthoringUnitLabels[definition.unit]}
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                aria-label="Delete target"
                onClick={() => {
                  setDrafts((current) => removeTargetDraft(current, step.id, index));
                  onChange((item) => ({
                    ...item,
                    targets: item.targets.filter((_, itemIndex) => itemIndex !== index),
                  }));
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
        {step.targets.length < 3 && !step.targets.some((target) => target.type === "rest") ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!category}
            onClick={() => {
              const type = targets[0];
              if (type)
                onChange((item) => ({
                  ...item,
                  targets: [
                    ...item.targets,
                    type === "rest" ? { type: "rest" as const } : { type, intensity: null },
                  ],
                }));
            }}
          >
            Add target
          </Button>
        ) : null}
      </div>
    </fieldset>
  );
}
