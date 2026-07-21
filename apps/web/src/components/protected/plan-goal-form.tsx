import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { Button } from "@repo/ui/components/button";
import { DateInput } from "@repo/ui/components/date-input";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { useState } from "react";

import { getTodayDateKey } from "../../lib/planning";
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

export function PlanGoalForm({
  goal,
  initialDate,
  profileId,
  redirectTo = "/plan",
}: PlanGoalFormProps) {
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

  return (
    <form
      action={goal ? updatePlanGoalAction.url : createPlanGoalAction.url}
      method="post"
      className="space-y-4"
    >
      <input type="hidden" name="profile_id" value={goal?.profile_id ?? profileId ?? ""} />
      {goal ? <input type="hidden" name="goal_id" value={goal.id} /> : null}
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <div className="space-y-2">
        <Label htmlFor="goal-title">Title</Label>
        <Input
          id="goal-title"
          name="title"
          value={goalTitle}
          onChange={(event) => setGoalTitle(event.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <DateInput
            id="goal-date"
            label="Target date"
            name="target_date"
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
            label="Priority"
            max={10}
            min={0}
            name="priority"
            value={goalPriority}
            onChange={setGoalPriority}
          />
        </div>
        <div>
          <BoundedNumberInput
            id="goal-sessions"
            decimals={0}
            label="Sessions / week"
            min={1}
            name="target_sessions_per_week"
            value={goalSessionsPerWeek}
            onChange={setGoalSessionsPerWeek}
          />
        </div>
        <div>
          <BoundedNumberInput
            id="goal-weeks"
            decimals={0}
            label="Weeks"
            min={1}
            name="target_weeks"
            value={goalWeeks}
            onChange={setGoalWeeks}
          />
        </div>
      </div>
      <Button type="submit" disabled={!(goal?.profile_id ?? profileId) || !goalTitle.trim()}>
        {goal ? "Save goal" : "Create goal"}
      </Button>
    </form>
  );
}
