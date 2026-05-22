import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { Button } from "@repo/ui/components/button";
import { DateInput } from "@repo/ui/components/date-input";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { useState } from "react";

import { getTodayDateKey } from "../../lib/planning";
import { createPlanGoalAction } from "../../lib/planning/server-actions";

type PlanGoalFormProps = {
  profileId?: string | null;
  redirectTo?: string;
};

export function PlanGoalForm({ profileId, redirectTo = "/plan" }: PlanGoalFormProps) {
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDate, setGoalDate] = useState(getTodayDateKey());
  const [goalPriority, setGoalPriority] = useState("5");
  const [goalActivityCategory, setGoalActivityCategory] = useState("run");
  const [goalSessionsPerWeek, setGoalSessionsPerWeek] = useState("4");
  const [goalWeeks, setGoalWeeks] = useState("8");

  return (
    <form action={createPlanGoalAction.url} method="post" className="space-y-4">
      <input type="hidden" name="profile_id" value={profileId ?? ""} />
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
      <Button type="submit" disabled={!profileId || !goalTitle.trim()}>
        Create goal
      </Button>
    </form>
  );
}
