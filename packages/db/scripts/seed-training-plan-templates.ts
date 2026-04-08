#!/usr/bin/env tsx

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { ALL_SAMPLE_PLANS } from "../../core/samples";
import { trainingPlans } from "../src/schema/tables";
import { deepEqual, prepareDbEnv } from "./_helpers";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const noDelete = args.includes("--no-delete") || args.includes("--no-clear");

const databaseUrl = prepareDbEnv();
const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle({ client: pool, casing: "snake_case" });

const templates = ALL_SAMPLE_PLANS;

type ExistingTrainingPlanTemplate = typeof trainingPlans.$inferSelect;

function hasChanges(local: (typeof ALL_SAMPLE_PLANS)[number], remote: ExistingTrainingPlanTemplate): boolean {
  if (local.name !== remote.name) return true;
  if ((local.description ?? null) !== (remote.description ?? null)) return true;
  if (local.sessions_per_week_target !== remote.sessions_per_week_target) return true;
  if (`${local.duration_hours}` !== `${remote.duration_hours ?? ""}`) return true;

  const localStructure = JSON.parse(JSON.stringify(local));

  return !deepEqual(localStructure, remote.structure);
}

async function seedTrainingPlanTemplates() {
  console.log("🌱 Starting training plan template sync...");
  console.log(`   Mode: ${isDryRun ? "DRY RUN" : "LIVE"}`);
  console.log("   Filter: all");
  console.log(`   Local Templates: ${templates.length}\n`);

  const existingTemplates = await db
    .select()
    .from(trainingPlans)
    .where(eq(trainingPlans.is_system_template, true));

  const idCounts = new Map<string, number>();
  for (const template of existingTemplates) {
    idCounts.set(template.id, (idCounts.get(template.id) ?? 0) + 1);
  }

  for (const [id, count] of idCounts) {
    if (count > 1) {
      console.warn(`⚠️  WARNING: Duplicate template ID found in DB: "${id}" (${count} occurrences)`);
    }
  }

  const existingMap = new Map(existingTemplates.map((template) => [template.id, template]));
  const processedIds = new Set<string>();

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let deletedCount = 0;
  let errorCount = 0;

  for (const template of templates) {
    if (!template.id) {
      console.error(`❌ Template "${template.name}" is missing a static ID. Skipping.`);
      errorCount += 1;
      continue;
    }

    processedIds.add(template.id);
    const existing = existingMap.get(template.id);

    try {
      if (existing) {
        if (hasChanges(template, existing)) {
          console.log(`📝 Updating "${template.name}" (${template.id})...`);

          if (!isDryRun) {
            await db
              .update(trainingPlans)
              .set({
                name: template.name,
                description: template.description ?? null,
                structure: template.structure,
                sessions_per_week_target: template.sessions_per_week_target,
                duration_hours: template.duration_hours?.toString() ?? null,
                is_public: true,
                template_visibility: "public",
                updated_at: new Date(),
              })
              .where(eq(trainingPlans.id, existing.id));
          }

          updatedCount += 1;
        } else {
          skippedCount += 1;
        }
      } else {
        console.log(`✨ Creating "${template.name}" (${template.id})...`);

        if (!isDryRun) {
          const now = new Date();

          await db.insert(trainingPlans).values({
            id: template.id,
            profile_id: null,
            is_system_template: true,
            template_visibility: "public",
            is_public: true,
            name: template.name,
            description: template.description ?? null,
            structure: template.structure,
            sessions_per_week_target: template.sessions_per_week_target,
            duration_hours: template.duration_hours?.toString() ?? null,
            created_at: now,
            updated_at: now,
          });
        }

        createdCount += 1;
      }
    } catch (error) {
      console.error(`❌ Error processing "${template.name}":`, error);
      errorCount += 1;
    }
  }

  const staleTemplates = existingTemplates.filter((template) => !processedIds.has(template.id));

  if (staleTemplates.length > 0) {
    console.log(`\nFound ${staleTemplates.length} stale template(s).`);

    if (noDelete) {
      console.log("   Skipping deletion (--no-delete active).");
    } else {
      for (const stale of staleTemplates) {
        console.log(`🗑️  Deleting "${stale.name}" (${stale.id})...`);

        if (!isDryRun) {
          try {
            await db.delete(trainingPlans).where(eq(trainingPlans.id, stale.id));
          } catch (error) {
            console.error(`❌ Failed to delete "${stale.name}":`, error);
            errorCount += 1;
            continue;
          }
        }

        deletedCount += 1;
      }
    }
  }

  console.log(`\n📊 Summary (${isDryRun ? "DRY RUN" : "LIVE"}):`);
  console.log(`   ✨ Created: ${createdCount}`);
  console.log(`   📝 Updated: ${updatedCount}`);
  console.log(`   ✓  Skipped: ${skippedCount}`);
  console.log(`   🗑️  Deleted: ${deletedCount}`);
  console.log(`   ❌ Errors:  ${errorCount}`);

  if (errorCount > 0) {
    process.exitCode = 1;
  }
}

try {
  await seedTrainingPlanTemplates();
  console.log("\n✨ Sync complete!");
} catch (error) {
  console.error("\n💥 Sync failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
