#!/usr/bin/env tsx

import { getSystemTrainingPlanDefinitions } from "@repo/core";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { trainingPlans } from "../src/schema/tables";
import { deepEqual, prepareDbEnv } from "./_helpers";
import { structureHash } from "./canonical-json";
import {
  materializeSystemTrainingPlanSeedValues,
  persistedTrainingPlanStructure,
  type SystemTrainingPlanDefinition,
} from "./system-content-seed-values";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isValidateOnly = args.includes("--validate-only");
const noDelete = args.includes("--no-delete") || args.includes("--no-clear");

let pool: Pool | undefined;

type ExistingTrainingPlanTemplate = typeof trainingPlans.$inferSelect;

function hasChanges(
  definition: SystemTrainingPlanDefinition,
  remote: ExistingTrainingPlanTemplate,
): boolean {
  const local = definition.content;
  if (local.name !== remote.name) return true;
  if ((local.description ?? null) !== (remote.description ?? null)) return true;
  if (local.sessions_per_week_target !== remote.sessions_per_week_target) return true;
  if (`${local.duration_hours}` !== `${remote.duration_hours ?? ""}`) return true;
  if (remote.profile_id !== null) return true;
  if (remote.is_system_template !== true) return true;
  if (remote.content_visibility !== "public") return true;
  if (remote.system_content_key !== definition.key) return true;
  if (remote.system_content_version !== definition.version) return true;
  if (remote.system_content_hash !== definition.contentHash) return true;

  const localStructure = persistedTrainingPlanStructure(local);

  return (
    structureHash(localStructure) !== remote.structure_hash ||
    !deepEqual(localStructure, remote.structure)
  );
}

async function seedTrainingPlanTemplates() {
  const definitions = await getSystemTrainingPlanDefinitions();
  for (const definition of definitions) persistedTrainingPlanStructure(definition.content);
  if (isValidateOnly) {
    console.log(`Validated ${definitions.length} strict canonical V1 system training templates.`);
    return;
  }

  const databaseUrl = prepareDbEnv();
  pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, casing: "snake_case" });

  console.log("🌱 Starting training plan template sync...");
  console.log(`   Mode: ${isDryRun ? "DRY RUN" : "LIVE"}`);
  console.log("   Filter: all");
  console.log(`   Local Templates: ${definitions.length}\n`);

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

  for (const definition of definitions) {
    const template = definition.content;
    if (!template.id) {
      console.error(`❌ Template "${template.name}" is missing a static ID. Skipping.`);
      errorCount += 1;
      continue;
    }

    processedIds.add(template.id);
    const existing = existingMap.get(template.id);

    try {
      const { id: _id, ...seedValues } = materializeSystemTrainingPlanSeedValues(definition);
      if (existing) {
        if (hasChanges(definition, existing)) {
          console.log(`📝 Updating "${template.name}" (${template.id})...`);

          if (!isDryRun) {
            await db
              .update(trainingPlans)
              .set({
                ...seedValues,
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
            ...materializeSystemTrainingPlanSeedValues(definition),
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
  await pool?.end();
}
