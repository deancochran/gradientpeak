import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { Button } from "@repo/ui/components/button";
import { DateInput } from "@repo/ui/components/date-input";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";

import { api } from "../../lib/api/client";
import { getTodayDateKey, isValidDateKey } from "../../lib/planning";
import { createPlanGoalAction, updatePlanGoalAction } from "../../lib/planning/server-actions";

type EditableGoal = {
  activity_category: string;
  id: string;
  priority: number;
  profile_id: string;
  target_date: string;
  target_payload?: unknown;
  title: string;
};

type PlanGoalFormProps = {
  profileId?: string | null;
  redirectTo?: string;
  goal?: EditableGoal | null;
  initialDate?: string;
};

function integerRangeError(value: string, min: number, max: number, label: string) {
  const parsed = Number(value);
  return value.trim() && Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? undefined
    : `${label} must be a whole number from ${min} to ${max}.`;
}

export function PlanGoalForm({
  goal,
  initialDate,
  profileId,
  redirectTo = "/plan",
}: PlanGoalFormProps) {
  const utils = api.useUtils();
  const createPlanGoal = useServerFn(createPlanGoalAction);
  const updatePlanGoal = useServerFn(updatePlanGoalAction);
  const consistencyPayload =
    goal?.target_payload && typeof goal.target_payload === "object"
      ? (goal.target_payload as { target_sessions_per_week?: number; target_weeks?: number })
      : null;
  const [goalTitle, setGoalTitle] = useState(goal?.title ?? "");
  const [goalDate, setGoalDate] = useState(goal?.target_date ?? initialDate ?? getTodayDateKey());
  const [goalPriority, setGoalPriority] = useState(String(goal?.priority ?? 5));
  const [goalActivityCategory, setGoalActivityCategory] = useState(
    goal?.activity_category ?? "run",
  );
  const [goalSessionsPerWeek, setGoalSessionsPerWeek] = useState(
    String(consistencyPayload?.target_sessions_per_week ?? 4),
  );
  const [goalWeeks, setGoalWeeks] = useState(String(consistencyPayload?.target_weeks ?? 8));
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTitleTouched, setIsTitleTouched] = useState(false);
  const submittingRef = useRef(false);
  const titleError = (() => {
    const title = goalTitle.trim();
    if (!title) return "Enter a goal title.";
    if (title.length > 100) return "Goal title must be 100 characters or fewer.";
    return undefined;
  })();
  const dateError = isValidDateKey(goalDate) ? undefined : "Choose a valid target date.";
  const priorityError = integerRangeError(goalPriority, 0, 10, "Priority");
  const sessionsError = integerRangeError(goalSessionsPerWeek, 1, 21, "Sessions per week");
  const weeksError = integerRangeError(goalWeeks, 1, 104, "Weeks");
  const hasFieldError = Boolean(
    titleError || dateError || priorityError || sessionsError || weeksError,
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    if (!(goal?.profile_id ?? profileId) || hasFieldError) {
      setIsTitleTouched(true);
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await (goal ? updatePlanGoal : createPlanGoal)({
        data: new FormData(event.currentTarget) as never,
      });
      if (result.status === "error") {
        setSubmitError(result.message);
        return;
      }
      await Promise.all([utils.goals.invalidate(), utils.athleteIntelligence.invalidate()]);
      window.location.assign(result.redirectTo);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to save goal. Try again.");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" data-testid="goal-form" onSubmit={handleSubmit}>
      <input type="hidden" name="profile_id" value={goal?.profile_id ?? profileId ?? ""} />
      {goal ? <input type="hidden" name="goal_id" value={goal.id} /> : null}
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="goal-title">Title</Label>
          <span data-testid="goal-title-required" className="text-xs text-muted-foreground">
            Required
          </span>
        </div>
        <Input
          id="goal-title"
          aria-describedby={isTitleTouched && titleError ? "goal-title-error" : undefined}
          aria-invalid={Boolean(isTitleTouched && titleError)}
          data-testid="goal-title-input"
          name="title"
          required
          maxLength={100}
          value={goalTitle}
          onChange={(event) => setGoalTitle(event.target.value)}
          onBlur={() => setIsTitleTouched(true)}
        />
        {isTitleTouched && titleError ? (
          <p id="goal-title-error" className="text-sm text-destructive">
            {titleError}
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <DateInput
            id="goal-date"
            label="Target date"
            name="target_date"
            {...(dateError ? { error: dateError } : {})}
            required
            value={goalDate}
            onChange={(value) => setGoalDate(value ?? "")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="goal-activity">Activity</Label>
          <select
            id="goal-activity"
            name="activity_category"
            value={goalActivityCategory}
            onChange={(event) => setGoalActivityCategory(event.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="run">Run</option>
            <option value="bike">Bike</option>
            <option value="swim">Swim</option>
            <option value="strength">Strength</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <BoundedNumberInput
            id="goal-priority"
            decimals={0}
            {...(priorityError ? { error: priorityError } : {})}
            label="Priority"
            max={10}
            min={0}
            name="priority"
            required
            value={goalPriority}
            onChange={setGoalPriority}
          />
        </div>
        <div>
          <BoundedNumberInput
            id="goal-sessions"
            decimals={0}
            {...(sessionsError ? { error: sessionsError } : {})}
            label="Sessions / week"
            max={21}
            min={1}
            name="target_sessions_per_week"
            required
            value={goalSessionsPerWeek}
            onChange={setGoalSessionsPerWeek}
          />
        </div>
        <div>
          <BoundedNumberInput
            id="goal-weeks"
            decimals={0}
            {...(weeksError ? { error: weeksError } : {})}
            label="Weeks"
            max={104}
            min={1}
            name="target_weeks"
            required
            value={goalWeeks}
            onChange={setGoalWeeks}
          />
        </div>
      </div>
      {submitError ? (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          {submitError}
        </p>
      ) : null}
      <Button
        data-testid="goal-submit"
        type="submit"
        disabled={!(goal?.profile_id ?? profileId) || hasFieldError || isSubmitting}
      >
        {isSubmitting ? "Saving..." : goal ? "Save goal" : "Create goal"}
      </Button>
    </form>
  );
}
