#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const lane = process.argv[2];
const extraArgs = process.argv.slice(3);

if (!lane) {
  console.error("[maestro-lane] Usage: run-maestro-lane.mjs <lane> [maestro args...]");
  process.exit(1);
}

const laneFlows = {
  bootstrap: [".maestro/flows/main/auth_navigation.yaml"],
  "cold-start": [".maestro/flows/journeys/resilience/warm_relaunch_authenticated.yaml"],
  smoke: [".maestro/flows/main/tabs_smoke.yaml"],
  discover: [".maestro/flows/journeys/discover/profile_detail_open.yaml"],
  messaging: [".maestro/flows/journeys/messaging/inbox_open.yaml"],
  notifications: [".maestro/flows/journeys/notifications/inbox_open.yaml"],
  social: [".maestro/flows/journeys/social/follow_target_from_profile.yaml"],
  calendar: [".maestro/flows/journeys/calendar/custom_event_create_edit_delete.yaml"],
  plans: [
    ".maestro/flows/journeys/plans/list_screen_open.yaml",
    ".maestro/flows/journeys/plans/training_plan_detail_open.yaml",
    ".maestro/flows/journeys/plans/training_plan_schedule_from_discover.yaml",
    ".maestro/flows/journeys/plans/activity_plan_schedule_from_discover.yaml",
  ],
  resilience: [
    ".maestro/flows/journeys/resilience/sign_in_invalid_spam_guard.yaml",
    ".maestro/flows/journeys/resilience/warm_relaunch_authenticated.yaml",
  ],
  "perf-sentinel": [".maestro/flows/main/tabs_smoke.yaml"],
};

const flows = laneFlows[lane];

if (!flows) {
  console.error(`[maestro-lane] Unknown lane: ${lane}`);
  process.exit(1);
}

for (const flow of flows) {
  const result = spawnSync("bash", ["./scripts/maestro-local.sh", ...extraArgs, flow], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
