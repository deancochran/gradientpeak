import type {
  ActivityPlanDuration,
  ActivityPlanIntervalStep,
  ActivityPlanSegment,
  CanonicalActivityCategory,
  EditableActivityPlanStructure,
} from "@repo/core";
import { activityPlanDocumentSchema, activityPlanStructureSchema } from "@repo/core/activity-plan";
import {
  type ActivityTargetType,
  activityTargetDefinitionByType,
  activityTargetTypes,
  getPermissibleTargetTypes,
} from "@repo/core/targets";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  applyActivityPlanActivityCategory,
  createActivityPlanInterval,
  createActivityPlanSegment,
  createActivityPlanStep,
  createActivityPlanStructure,
  getActivityPlanActivityCategory,
  hasIncompatibleTargets,
  moveActivityPlanItem,
  updateActivityInterval,
  updateActivitySegment,
  updateActivityStep,
} from "../../lib/activity-plan-authoring";

const activity_categories = ["run", "bike", "swim", "strength", "other"] as const;
const visibilityOptions = ["private", "followers", "public"] as const;
const selectClassName =
  "h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type ActivityPlanAuthoringMetadata = {
  description: string | null;
  gps_recording_enabled: boolean;
  name: string;
  notes: string | null;
  content_visibility: (typeof visibilityOptions)[number];
};

export type ActivityPlanCreateAuthoringValues = ActivityPlanAuthoringMetadata & {
  structure: ReturnType<typeof activityPlanStructureSchema.parse>;
};

export type ActivityPlanEditAuthoringValues = ActivityPlanAuthoringMetadata & {
  structure: ReturnType<typeof activityPlanDocumentSchema.parse>;
};

type ActivityPlanComposerInitial = {
  description?: string | null;
  gps_recording_enabled?: boolean;
  name: string;
  notes?: string | null;
  structure: unknown;
  content_visibility?: string | null;
};

type ActivityPlanComposerProps = {
  onCancel: () => void;
  pending?: boolean;
} & (
  | {
      initial?: ActivityPlanComposerInitial;
      mode: "create";
      onSave: (values: ActivityPlanCreateAuthoringValues) => Promise<void> | void;
    }
  | {
      initial: ActivityPlanComposerInitial;
      initialVariantId?: string;
      mode: "edit";
      onSave: (values: ActivityPlanEditAuthoringValues) => Promise<void> | void;
    }
);

type EditableActivityPlanDocument = {
  contractVersion: 1;
  defaultVariantId: string;
  variants: Array<{
    id: string;
    name: string;
    structure: EditableActivityPlanStructure;
  }>;
};

function editableDocument(value: unknown): EditableActivityPlanDocument | null {
  const parsed = activityPlanDocumentSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    contractVersion: 1,
    defaultVariantId: parsed.data.defaultVariantId,
    variants: parsed.data.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      structure: editableStructure(variant.structure),
    })),
  };
}

function nextVariantName(document: EditableActivityPlanDocument) {
  const names = new Set(document.variants.map((variant) => variant.name.toLocaleLowerCase()));
  for (let index = 2; index <= document.variants.length + 2; index += 1) {
    const candidate = `Variant ${index}`;
    if (!names.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return `Variant ${document.variants.length + 1}`;
}

function editableStructure(value: unknown): EditableActivityPlanStructure {
  const parsed = activityPlanStructureSchema.safeParse(value);
  return parsed.success
    ? {
        version: 3,
        activity_category: parsed.data.activity_category,
        segments: [...parsed.data.segments],
      }
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

export function ActivityPlanComposer(props: ActivityPlanComposerProps) {
  const { initial, mode, onCancel, pending = false } = props;
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [visibility, setVisibility] = useState<ActivityPlanAuthoringMetadata["content_visibility"]>(
    initial?.content_visibility === "public" || initial?.content_visibility === "followers"
      ? initial.content_visibility
      : "private",
  );
  const [gpsEnabled, setGpsEnabled] = useState(initial?.gps_recording_enabled ?? true);
  const [createStructure, setCreateStructure] = useState<EditableActivityPlanStructure>(() =>
    initial ? editableStructure(initial.structure) : createActivityPlanStructure(),
  );
  const [document, setDocument] = useState<EditableActivityPlanDocument | null>(() =>
    mode === "edit" ? editableDocument(initial.structure) : null,
  );
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(() => {
    if (mode !== "edit") return null;
    const initialDocument = editableDocument(initial.structure);
    if (!initialDocument) return null;
    return initialDocument.variants.some((variant) => variant.id === props.initialVariantId)
      ? (props.initialVariantId ?? initialDocument.defaultVariantId)
      : initialDocument.defaultVariantId;
  });
  const selectedVariant = document?.variants.find((variant) => variant.id === selectedVariantId);
  const structure = selectedVariant?.structure ?? createStructure;
  const activity_category = getActivityPlanActivityCategory(structure);
  const setStructure: React.Dispatch<React.SetStateAction<EditableActivityPlanStructure>> = (
    action,
  ) => {
    if (mode === "create") {
      setCreateStructure(action);
      return;
    }
    setDocument((current) => {
      if (!current || !selectedVariantId) return current;
      return {
        ...current,
        variants: current.variants.map((variant) =>
          variant.id === selectedVariantId
            ? {
                ...variant,
                structure: typeof action === "function" ? action(variant.structure) : action,
              }
            : variant,
        ),
      };
    });
  };
  const [pendingActivityCategory, setPendingActivityCategory] =
    useState<CanonicalActivityCategory | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const parsed = useMemo(
    () =>
      mode === "edit"
        ? activityPlanDocumentSchema.safeParse(document)
        : activityPlanStructureSchema.safeParse(createStructure),
    [createStructure, document, mode],
  );
  const firstIssue = parsed.success ? null : parsed.error.issues[0]?.message;

  const updateAllStructures = (
    update: (current: EditableActivityPlanStructure) => EditableActivityPlanStructure,
  ) => {
    if (mode === "create") {
      setCreateStructure(update);
      return;
    }
    setDocument((current) =>
      current
        ? {
            ...current,
            variants: current.variants.map((variant) => ({
              ...variant,
              structure: update(variant.structure),
            })),
          }
        : current,
    );
  };

  const removeSegment = (segmentId: string) => {
    setStructure((current) => ({
      version: 3,
      activity_category: current.activity_category,
      segments: current.segments.filter((segment) => segment.id !== segmentId),
    }));
  };

  const removeInterval = (intervalId: string) => {
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
    setStructure((current) =>
      updateActivityInterval(current, intervalId, (interval) => ({
        ...interval,
        steps: interval.steps.filter((step) => step.id !== stepId),
      })),
    );
  };

  const save = async () => {
    setSaveError(null);
    const validStructure = activityPlanStructureSchema.safeParse(createStructure);
    const validDocument = activityPlanDocumentSchema.safeParse(document);
    if (!name.trim() || (mode === "create" ? !validStructure.success : !validDocument.success)) {
      setSaveError("Enter a plan name and correct the activity structure before saving.");
      saveButtonRef.current?.focus();
      return;
    }
    try {
      const metadata = {
        description: description.trim() || null,
        gps_recording_enabled: gpsEnabled,
        name: name.trim(),
        notes: notes.trim() || null,
        content_visibility: visibility,
      };
      if (mode === "edit" && validDocument.success) {
        await props.onSave({ ...metadata, structure: validDocument.data });
      } else if (mode === "create" && validStructure.success) {
        await props.onSave({ ...metadata, structure: validStructure.data });
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Activity plan could not be saved.");
      saveButtonRef.current?.focus();
    }
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
                  event.currentTarget.value as ActivityPlanAuthoringMetadata["content_visibility"],
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
          <div className="space-y-2">
            <FieldLabel htmlFor="activity-plan-activity_category">
              Plan activity category
            </FieldLabel>
            <select
              aria-describedby="activity-plan-activity_category-help"
              className={`${selectClassName} w-full`}
              id="activity-plan-activity_category"
              onChange={(event) => {
                const nextActivityCategory = event.currentTarget.value as CanonicalActivityCategory;
                if (nextActivityCategory === activity_category) return;
                const structures = document
                  ? document.variants.map((variant) => variant.structure)
                  : [structure];
                if (
                  structures.some((candidate) =>
                    hasIncompatibleTargets(candidate, nextActivityCategory),
                  )
                ) {
                  setPendingActivityCategory(nextActivityCategory);
                  return;
                }
                updateAllStructures((current) =>
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
            <p className="text-xs text-muted-foreground" id="activity-plan-activity_category-help">
              All activity segments use this activity category. Compatible targets are preserved.
            </p>
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

      {mode === "edit" && document && selectedVariant ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>Variants</CardTitle>
            <Button
              onClick={() => {
                const variantId = crypto.randomUUID();
                const structureClone = activityPlanStructureSchema.parse(selectedVariant.structure);
                setDocument((current) =>
                  current
                    ? {
                        ...current,
                        variants: [
                          ...current.variants,
                          {
                            id: variantId,
                            name: nextVariantName(current),
                            structure: editableStructure(structureClone),
                          },
                        ],
                      }
                    : current,
                );
                setSelectedVariantId(variantId);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus className="mr-1 h-4 w-4" /> Add variant
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel htmlFor="activity-plan-variant">Variant</FieldLabel>
              <select
                className={`${selectClassName} w-full`}
                id="activity-plan-variant"
                onChange={(event) => setSelectedVariantId(event.currentTarget.value)}
                value={selectedVariant.id}
              >
                {document.variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name}
                    {variant.id === document.defaultVariantId ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="activity-plan-variant-name">Variant name</FieldLabel>
              <Input
                id="activity-plan-variant-name"
                maxLength={100}
                onChange={(event) => {
                  const variantName = event.currentTarget.value;
                  setDocument((current) =>
                    current
                      ? {
                          ...current,
                          variants: current.variants.map((variant) =>
                            variant.id === selectedVariant.id
                              ? { ...variant, name: variantName }
                              : variant,
                          ),
                        }
                      : current,
                  );
                }}
                value={selectedVariant.name}
              />
            </div>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button
                disabled={selectedVariant.id === document.defaultVariantId}
                onClick={() =>
                  setDocument((current) =>
                    current ? { ...current, defaultVariantId: selectedVariant.id } : current,
                  )
                }
                type="button"
                variant="outline"
              >
                {selectedVariant.id === document.defaultVariantId
                  ? "Default variant"
                  : "Set as default"}
              </Button>
              <Button
                disabled={
                  document.variants.length === 1 || selectedVariant.id === document.defaultVariantId
                }
                onClick={() => {
                  const nextVariant = document.variants.find(
                    (variant) => variant.id !== selectedVariant.id,
                  );
                  if (!nextVariant) return;
                  setDocument((current) =>
                    current
                      ? {
                          ...current,
                          variants: current.variants.filter(
                            (variant) => variant.id !== selectedVariant.id,
                          ),
                        }
                      : current,
                  );
                  setSelectedVariantId(nextVariant.id);
                }}
                type="button"
                variant="outline"
              >
                Delete variant
              </Button>
              {selectedVariant.id === document.defaultVariantId && document.variants.length > 1 ? (
                <p className="self-center text-xs text-muted-foreground">
                  Set another variant as default before deleting this one.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Activity structure</h2>
          <p className="text-sm text-muted-foreground">
            Build a single-activity-category activity with activity and rest segments in execution
            order.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["activity", "rest"] as const).map((role) => (
            <Button
              key={role}
              onClick={() =>
                setStructure((current) => ({
                  version: 3,
                  activity_category: current.activity_category,
                  segments: [...current.segments, createActivityPlanSegment(role)],
                }))
              }
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus className="mr-1 h-4 w-4" />
              {role === "activity" ? "Activity" : "Rest"}
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
              activity_category: current.activity_category,
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
      {saveError ? (
        <p
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          {saveError}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button disabled={pending} onClick={onCancel} type="button" variant="outline">
          Cancel
        </Button>
        <Button
          disabled={pending || !name.trim() || !parsed.success}
          onClick={() => void save()}
          ref={saveButtonRef}
          type="button"
        >
          {pending ? "Saving..." : mode === "edit" ? "Save changes" : "Create plan"}
        </Button>
      </div>
      <AlertDialog
        open={pendingActivityCategory !== null}
        onOpenChange={(open) => !open && setPendingActivityCategory(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset incompatible targets?</AlertDialogTitle>
            <AlertDialogDescription>
              Some current targets are not supported for {pendingActivityCategory ?? "this"}.
              Continue to change the plan activity category and reset only those targets to RPE 5,
              or cancel to keep the current activity category and targets.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current activity category</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingActivityCategory) return;
                updateAllStructures((current) =>
                  applyActivityPlanActivityCategory(current, pendingActivityCategory, true),
                );
                setPendingActivityCategory(null);
              }}
            >
              Change activity category and reset targets
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type SegmentEditorProps = {
  index: number;
  onChange: (update: (segment: ActivityPlanSegment) => ActivityPlanSegment) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
  onRemoveInterval: (intervalId: string) => void;
  onRemoveStep: (intervalId: string, stepId: string) => void;
  segment: ActivityPlanSegment;
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
          {segment.role !== "activity" ? (
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
          ) : null}
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
                    activityCategory={structure.activity_category}
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
  activityCategory,
  index,
  intervalId,
  onRemove,
  setStructure,
  step,
}: {
  activityCategory: CanonicalActivityCategory;
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
          {activityTargetTypes
            .filter((type) => getPermissibleTargetTypes(activityCategory).includes(type))
            .map((type) => (
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
