import { resolve } from "node:path";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { dbPackageRoot } from "./_helpers";
import { assertCanonicalActivityPlanStructureInventory } from "./activity-plan-structure-preflight";

const baseline = "20260726005149_generation_2_baseline.sql";
const ownerId = "10000000-0000-4000-8000-000000000001";
const hash = `v1:sha256:${"a".repeat(64)}`;

await withDisposableDatabase(
  ["--disposable", "--local"],
  "activity_plan_preflight",
  async (target) => {
    await bootstrapSupabaseSchemas(target);
    await applySqlFile(target, resolve(dbPackageRoot, "supabase/migrations", baseline));
    await target.query(
      "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'owner@example.test', '{}'::jsonb)",
      [ownerId],
    );
    await target.query(
      `insert into public.activity_plans (id, profile_id, name, structure, structure_hash)
     values
       ('20000000-0000-4000-8000-000000000001', $1, 'valid', $2::jsonb, $3),
       ('20000000-0000-4000-8000-000000000002', $1, 'invalid', $4::jsonb, $3)`,
      [
        ownerId,
        JSON.stringify({
          version: 3,
          segments: [
            {
              id: "30000000-0000-4000-8000-000000000001",
              role: "activity",
              activity_category: "run",
              name: "Run",
              intervals: [
                {
                  id: "30000000-0000-4000-8000-000000000002",
                  name: "Work",
                  repetitions: 1,
                  steps: [
                    {
                      id: "30000000-0000-4000-8000-000000000003",
                      name: "Step",
                      duration: { type: "time", seconds: 60 },
                      targets: [{ type: "RPE", intensity: 5 }],
                    },
                  ],
                },
              ],
            },
          ],
        }),
        hash,
        JSON.stringify({ version: 3, segments: [{ role: "activity", activity_category: "run" }] }),
      ],
    );
    try {
      await assertCanonicalActivityPlanStructureInventory(target);
    } catch (error) {
      const message = String(error);
      if (
        message.includes("scanned=2 invalid=1") &&
        message.includes("20000000-0000-4000-8000-000000000002")
      )
        return;
      throw error;
    }
    throw new Error("Core ActivityPlan preflight accepted a coarse-only structure");
  },
);

console.log(
  "[db:activity-plans:preflight:test] exact Core inventory rejects coarse-only rows without logging payloads",
);
