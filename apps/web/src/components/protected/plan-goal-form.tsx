import {
  activityCategoryChoices,
  buildGoalCreatePayload,
  buildGoalDraftFromGoal,
  canonicalActivityCategorySchema,
  createEmptyGoalDraft,
  type GoalEditorDraft,
  type GoalEditorTargetField,
  getGoalEditorTargetFields,
  goalFocusChoices,
  goalPriorityChoices,
  goalPriorityHelpText,
  goalRaceMeasureChoices,
  type ProfileGoalRecord,
  parseProfileGoalRecord,
  resetGoalEditorDraftForType,
} from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { ChoiceField as Choice } from "@repo/ui/components/choice-field";
import { DateInput } from "@repo/ui/components/date-input";
import {
  Form,
  FormBoundedNumberField,
  FormDurationField,
  FormPaceField,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { useZodFormSubmit } from "@repo/ui/hooks";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { type FieldPath, type FieldPathValue, useForm } from "react-hook-form";
import { api } from "../../lib/api/client";
import { getTodayDateKey } from "../../lib/planning";
import { createPlanGoalAction, updatePlanGoalAction } from "../../lib/planning/server-actions";
import { useFormLifetime } from "../../lib/use-form-lifetime";

type PlanGoalFormProps = {
  profileId?: string | null;
  redirectTo?: string;
  goal?: ProfileGoalRecord | null;
  initialDate?: string;
  onCancel?: () => void;
};

const goalTypes = goalFocusChoices;

type NumericField =
  | "importance"
  | "raceDistanceKm"
  | "targetWatts"
  | "targetBpm"
  | "consistencySessionsPerWeek"
  | "consistencyWeeks";

export function PlanGoalForm(props: PlanGoalFormProps) {
  const lifetime = useFormLifetime();
  return (
    <PlanGoalFormSession
      key={`${props.goal?.id ?? props.profileId ?? "new"}:${lifetime.sessionKey}`}
      {...props}
      isCurrent={lifetime.isCurrent}
      onExit={() => {
        lifetime.end();
        if (props.onCancel) props.onCancel();
        else window.location.assign(props.redirectTo ?? "/plan");
      }}
    />
  );
}

function PlanGoalFormSession({
  goal,
  initialDate,
  profileId,
  redirectTo = "/plan",
  isCurrent,
  onExit,
}: PlanGoalFormProps & { isCurrent: () => boolean; onExit: () => void }) {
  const utils = api.useUtils();
  const createPlanGoal = useServerFn(createPlanGoalAction);
  const updatePlanGoal = useServerFn(updatePlanGoalAction);
  const [defaultValues] = useState<GoalEditorDraft>(() =>
    goal
      ? buildGoalDraftFromGoal({ goal: parseProfileGoalRecord(goal) })
      : {
          ...createEmptyGoalDraft(),
          goalType: "consistency",
          targetDate: initialDate ?? getTodayDateKey(),
        },
  );
  const form = useForm<GoalEditorDraft>({ defaultValues });
  const draft = form.watch();
  const isSubmitting = form.formState.isSubmitting;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const subscription = form.watch((_values, event) => {
      if (event.type === "change") setSubmitError(null);
    });
    return () => {
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, [form]);

  function update<K extends FieldPath<GoalEditorDraft>>(
    name: K,
    value: FieldPathValue<GoalEditorDraft, K>,
  ) {
    if (!mounted.current || !isCurrent() || submittingRef.current || form.formState.isSubmitting)
      return;
    form.setValue(name, value, { shouldDirty: true });
    setSubmitError(null);
  }

  function numberField(field: NumericField, label: string, required = false, integer = false) {
    return (
      <FormBoundedNumberField
        key={`${draft.goalType}:${field}`}
        control={form.control}
        name={field}
        label={label}
        disabled={isSubmitting}
        required={required}
        decimals={integer ? 0 : 8}
        min={field === "importance" ? 0 : Number.MIN_VALUE}
        max={field === "importance" ? 10 : Number.POSITIVE_INFINITY}
        emptyValue={null}
      />
    );
  }

  const targetFields = getGoalEditorTargetFields(draft);
  function renderTargetField(field: GoalEditorTargetField) {
    switch (field.name) {
      case "raceDistanceKm":
        return numberField(field.name, "Distance (km)", field.required);
      case "targetDuration":
        return (
          <FormDurationField
            key={`${draft.goalType}:${field.name}`}
            control={form.control}
            name={field.name}
            label={draft.goalType === "completion" ? "Duration" : "Goal time"}
            required={field.required}
            disabled={isSubmitting}
          />
        );
      case "targetPace":
        return (
          <FormPaceField
            key={`${draft.goalType}:${field.name}`}
            control={form.control}
            name={field.name}
            label={draft.goalType === "race_performance" ? "Goal pace" : "Target pace"}
            required={field.required}
            disabled={isSubmitting}
          />
        );
      case "targetWatts":
        return numberField(field.name, "Watts", field.required);
      case "targetBpm":
        return numberField(field.name, "Target bpm", field.required);
      case "thresholdTestDuration":
        return (
          <FormDurationField
            key={`${draft.goalType}:${field.name}`}
            control={form.control}
            name={field.name}
            label="Test duration"
            disabled={isSubmitting}
          />
        );
      case "consistencySessionsPerWeek":
        return numberField(field.name, "Sessions / week", false, true);
      case "consistencyWeeks":
        return numberField(field.name, "Weeks", false, true);
    }
  }

  async function saveDraft(values: GoalEditorDraft) {
    if (!mounted.current || !isCurrent() || submittingRef.current) return;
    const owner = goal?.profile_id ?? profileId;
    if (!owner) {
      setSubmitError("Choose an athlete before saving this goal.");
      return;
    }
    try {
      // The snapshot is editing context only. Only the validated canonical payload crosses transport.
      const payload = buildGoalCreatePayload({ draft: values, profileId: owner });
      submittingRef.current = true;
      setSubmitError(null);
      const result = goal
        ? await updatePlanGoal({ data: { ...payload, goal_id: goal.id, redirectTo } })
        : await createPlanGoal({ data: { ...payload, redirectTo } });
      if (result.status === "error") {
        if (mounted.current && isCurrent()) setSubmitError(result.message);
        return;
      }
      await Promise.all([utils.goals.invalidate(), utils.athleteIntelligence.invalidate()]);
      if (!mounted.current || !isCurrent()) return;
      window.location.assign(result.redirectTo);
    } catch (error) {
      if (mounted.current && isCurrent())
        setSubmitError(error instanceof Error ? error.message : "Unable to save goal. Try again.");
    } finally {
      submittingRef.current = false;
    }
  }

  const submit = useZodFormSubmit<GoalEditorDraft>({
    form,
    onSubmit: saveDraft,
    onValidationError: (errors) => {
      const first = Object.values(errors).find((error) => typeof error?.message === "string");
      setSubmitError(
        typeof first?.message === "string"
          ? first.message
          : "Correct the highlighted fields before saving.",
      );
    },
  });

  return (
    <Form {...form}>
      <form noValidate className="space-y-4" data-testid="goal-form" onSubmit={submit.handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="goal-title">Title</Label>
          <span data-testid="goal-title-required" className="text-xs text-muted-foreground">
            Required
          </span>
          <Input
            id="goal-title"
            data-testid="goal-title-input"
            required
            maxLength={100}
            disabled={isSubmitting}
            value={draft.title}
            onChange={(event) => update("title", event.target.value)}
          />
        </div>
        <DateInput
          id="goal-date"
          label="Target date"
          required
          disabled={isSubmitting}
          value={draft.targetDate}
          onChange={(value) => update("targetDate", value ?? "")}
        />
        <Choice
          label="Priority"
          value={draft.importance}
          options={goalPriorityChoices}
          helperText={goalPriorityHelpText}
          disabled={isSubmitting}
          isCurrent={isCurrent}
          required
          onChange={(importance) => update("importance", importance)}
        />
        <Choice
          label="Goal type"
          isCurrent={isCurrent}
          required
          value={draft.goalType}
          options={goalTypes}
          disabled={isSubmitting}
          onChange={(value) => {
            const choice = goalTypes.find((option) => option.value === value);
            if (
              !choice ||
              choice.value === draft.goalType ||
              submittingRef.current ||
              form.formState.isSubmitting
            )
              return;
            setSubmitError(null);
            form.reset(resetGoalEditorDraftForType({ draft, goalType: choice.value }));
          }}
        />
        <Choice
          label="Activity"
          isCurrent={isCurrent}
          required
          value={draft.activityCategory}
          disabled={isSubmitting}
          options={activityCategoryChoices}
          onChange={(value) => {
            const category = canonicalActivityCategorySchema.safeParse(value);
            if (category.success) update("activityCategory", category.data);
          }}
        />
        {targetFields.some((field) => field.name === "raceDistanceKm") ? (
          <>
            {targetFields.filter((field) => field.name === "raceDistanceKm").map(renderTargetField)}
            {draft.goalType === "race_performance" ? (
              <Choice
                label="Race target"
                isCurrent={isCurrent}
                required
                value={draft.raceTargetMode ?? "time"}
                disabled={isSubmitting}
                options={goalRaceMeasureChoices}
                onChange={(value) => {
                  if (value === "time" || value === "pace") update("raceTargetMode", value);
                }}
              />
            ) : null}
            {targetFields.filter((field) => field.name !== "raceDistanceKm").map(renderTargetField)}
          </>
        ) : null}
        {!targetFields.some((field) => field.name === "raceDistanceKm")
          ? targetFields.map(renderTargetField)
          : null}
        {submitError ? (
          <p role="alert" aria-live="polite" className="text-sm text-destructive">
            {submitError}
          </p>
        ) : null}
        <Button data-testid="goal-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : goal ? "Save goal" : "Create goal"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (mounted.current && isCurrent()) onExit();
          }}
        >
          Cancel
        </Button>
      </form>
    </Form>
  );
}
