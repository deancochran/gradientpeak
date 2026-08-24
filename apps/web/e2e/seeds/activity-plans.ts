import { createHash } from "node:crypto";
import type { E2EQuery } from "../support/database";

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

export async function seedOwnedActivityPlan(
  pool: E2EQuery,
  profileId: string,
  isolatedNamespace: string,
) {
  const fixtureId = (label: string) => deterministicFixtureUuid(`${isolatedNamespace}|${label}`);
  const activityPlanId = fixtureId("primary");
  const structure = {
    version: 3,
    activity_category: "bike",
    segments: [
      {
        id: "e1000000-0000-4000-8000-000000000001",
        role: "activity",
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
    description: "A deterministic tempo activity plan for browser journeys.",
    id: activityPlanId,
    name: "Playwright Tempo Builder",
    notes: "Bring bottles",
    profileId,
    structure,
  });

  for (let index = 1; index <= 21; index += 1) {
    const activity_category = index % 2 === 0 ? "run" : "bike";
    const libraryStructure = {
      version: 3,
      activity_category,
      segments: [
        {
          id: `f1000000-0000-4000-8000-${String(index * 10).padStart(12, "0")}`,
          role: "activity",
          name: `${activity_category} segment`,
          intervals: [
            {
              id: `f2000000-0000-4000-8000-${String(index * 10).padStart(12, "0")}`,
              name: "Steady work",
              repetitions: 1,
              steps: [
                {
                  id: `f3000000-0000-4000-8000-${String(index * 10).padStart(12, "0")}`,
                  name: "Steady",
                  duration: { type: "time", seconds: 600 },
                  targets: [{ type: "RPE", intensity: 5 }],
                },
              ],
            },
          ],
        },
      ],
    };

    await upsertActivityPlan(pool, {
      description: `Deterministic ${activity_category} library fixture ${index}.`,
      id: fixtureId(`library-${index}`),
      name: `Playwright Library ${String(index).padStart(2, "0")}`,
      notes: null,
      profileId,
      structure: libraryStructure,
    });
  }
  return { activityPlanId };
}

function deterministicFixtureUuid(value: string) {
  const digest = createHash("sha256").update(value).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

async function upsertActivityPlan(
  pool: E2EQuery,
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
      "gps_recording_enabled", "content_visibility", "is_system_template"
    ) values ($1, $2, $3, $4, $5, $6::jsonb, $7, true, 'private', false)
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
