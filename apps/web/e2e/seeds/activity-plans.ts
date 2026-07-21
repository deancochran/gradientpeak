import { createHash } from "node:crypto";
import type { Pool } from "pg";

function canonicalSeedJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Activity plan contains a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalSeedJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalSeedJson(nested)}`)
      .join(",")}}`;
  }
  throw new Error(`Activity plan contains unsupported ${typeof value}`);
}

function activityPlanSeedStructureHash(structure: unknown) {
  return `v1:sha256:${createHash("sha256").update(canonicalSeedJson(structure)).digest("hex")}`;
}

export const TEST_ACTIVITY_PLAN_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

export async function seedOwnedActivityPlan(pool: Pool, profileId: string) {
  await pool.query('delete from "activity_plans" where "profile_id" = $1', [profileId]);

  const structure = {
    version: 3,
    segments: [
      {
        id: "e1000000-0000-4000-8000-000000000001",
        role: "activity",
        category: "bike",
        name: "Tempo ride",
        intervals: [
          {
            id: "e2000000-0000-4000-8000-000000000001",
            name: "Main set",
            repetitions: 1,
            steps: [
              {
                id: "e3000000-0000-4000-8000-000000000001",
                name: "Tempo",
                duration: { type: "time", seconds: 1_800 },
                targets: [{ type: "%FTP", intensity: 75 }],
              },
            ],
          },
        ],
      },
    ],
  };

  await upsertActivityPlan(pool, {
    description: "A deterministic tempo workout for browser journeys.",
    id: TEST_ACTIVITY_PLAN_ID,
    name: "Playwright Tempo Builder",
    notes: "Bring bottles",
    profileId,
    structure,
  });

  for (let index = 1; index <= 21; index += 1) {
    const categories =
      index === 21 ? (["bike", "run"] as const) : ([index % 2 === 0 ? "run" : "bike"] as const);
    const libraryStructure = {
      version: 3,
      segments: categories.map((category, segmentIndex) => ({
        id: `f1000000-0000-4000-8000-${String(index * 10 + segmentIndex).padStart(12, "0")}`,
        role: "activity",
        category,
        name: `${category} segment`,
        intervals: [
          {
            id: `f2000000-0000-4000-8000-${String(index * 10 + segmentIndex).padStart(12, "0")}`,
            name: "Steady work",
            repetitions: 1,
            steps: [
              {
                id: `f3000000-0000-4000-8000-${String(index * 10 + segmentIndex).padStart(12, "0")}`,
                name: "Steady",
                duration: { type: "time", seconds: 600 },
                targets: [{ type: "RPE", intensity: 5 }],
              },
            ],
          },
        ],
      })),
    };

    await upsertActivityPlan(pool, {
      description:
        index === 21
          ? "A deterministic bike and run brick workout."
          : `Deterministic ${categories[0]} library fixture ${index}.`,
      id: `f0000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      name:
        index === 21
          ? "Playwright Multisport Brick"
          : `Playwright Library ${String(index).padStart(2, "0")}`,
      notes: null,
      profileId,
      structure: libraryStructure,
    });
  }
}

async function upsertActivityPlan(
  pool: Pool,
  plan: {
    description: string;
    id: string;
    name: string;
    notes: string | null;
    profileId: string;
    structure: unknown;
  },
) {
  await pool.query(
    `insert into "activity_plans" (
      "id", "profile_id", "name", "description", "notes", "structure", "structure_hash",
      "gps_recording_enabled", "template_visibility", "content_visibility", "is_system_template"
    ) values ($1, $2, $3, $4, $5, $6::jsonb, $7, true, 'private', 'private', false)
    on conflict ("id") do update set
      "profile_id" = excluded."profile_id",
      "name" = excluded."name",
      "description" = excluded."description",
      "notes" = excluded."notes",
      "structure" = excluded."structure",
      "structure_hash" = excluded."structure_hash",
      "updated_at" = now()`,
    [
      plan.id,
      plan.profileId,
      plan.name,
      plan.description,
      plan.notes,
      JSON.stringify(plan.structure),
      activityPlanSeedStructureHash(plan.structure),
    ],
  );
}
