#!/usr/bin/env tsx

import {
  type CanonicalActivityCategory,
  canonicalActivityCategorySchema,
  getSystemActivityTemplateDefinitions,
  type SystemActivityTemplateDefinition,
} from "@repo/core";
import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { activityPlans } from "../src/schema/tables";
import { deepEqual, prepareDbEnv } from "./_helpers";
import { structureHash } from "./canonical-json";
import { materializeSystemActivityTemplateSeedValues } from "./system-content-seed-values";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isValidateOnly = args.includes("--validate-only");
const noDelete = args.includes("--no-delete") || args.includes("--no-clear");
const categoryArg = args.find((arg) => arg.startsWith("--activity_category="));
const activity_category: CanonicalActivityCategory | undefined = categoryArg
  ? canonicalActivityCategorySchema.parse(categoryArg.slice("--activity_category=".length))
  : undefined;

let pool: Pool | undefined;

type ExistingActivityTemplate = typeof activityPlans.$inferSelect;

function hasChanges(
  definition: SystemActivityTemplateDefinition,
  remote: ExistingActivityTemplate,
): boolean {
  const local = definition.content;
  if (local.name !== remote.name) return true;
  if (local.description !== (remote.description ?? null)) return true;
  if ((local.gps_recording_enabled ?? true) !== remote.gps_recording_enabled) return true;
  if (structureHash(local.structure) !== remote.structure_hash) return true;
  if ((local.notes ?? null) !== (remote.notes ?? null)) return true;
  if (local.training_intent !== remote.training_intent) return true;
  if (remote.profile_id !== null) return true;
  if (remote.is_system_template !== true) return true;
  if (remote.content_visibility !== "public") return true;
  if (remote.system_content_key !== definition.key) return true;
  if (remote.system_content_version !== definition.version) return true;
  if (remote.system_content_hash !== definition.contentHash) return true;

  const localStructure = JSON.parse(JSON.stringify(local.structure));
  const remoteStructure = remote.structure;

  if (!deepEqual(localStructure, remoteStructure)) return true;
  return false;
}

async function seedTemplates() {
  const definitions = (await getSystemActivityTemplateDefinitions()).filter(
    (definition) =>
      activity_category === undefined ||
      definition.content.structure.activity_category === activity_category,
  );
  for (const definition of definitions) {
    activityPlanStructureSchema.parse(definition.content.structure);
  }
  if (isValidateOnly) {
    console.log(`Validated ${definitions.length} strict current system activity templates.`);
    return;
  }

  const databaseUrl = prepareDbEnv();
  pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, casing: "snake_case" });

  console.log("🌱 Starting template sync...");
  console.log(`   Mode: ${isDryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`   Filter: ${activity_category ? `${activity_category} only` : "all"}`);
  console.log(`   Local Templates: ${definitions.length}\n`);

  const existingTemplates = await db
    .select()
    .from(activityPlans)
    .where(eq(activityPlans.is_system_template, true));

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
      const { id: _id, ...seedValues } = materializeSystemActivityTemplateSeedValues(definition);
      if (existing) {
        if (hasChanges(definition, existing)) {
          console.log(`📝 Updating "${template.name}" (${template.id})...`);

          if (!isDryRun) {
            const structureChanged = seedValues.semantic_hash !== existing.semantic_hash;
            await db
              .update(activityPlans)
              .set({
                ...seedValues,
                ...(structureChanged ? { revision: sql`${activityPlans.revision} + 1` } : {}),
                updated_at: new Date(),
              })
              .where(eq(activityPlans.id, existing.id));
          }

          updatedCount += 1;
        } else {
          skippedCount += 1;
        }
      } else {
        console.log(`✨ Creating "${template.name}" (${template.id})...`);

        if (!isDryRun) {
          const now = new Date();

          await db.insert(activityPlans).values({
            ...materializeSystemActivityTemplateSeedValues(definition),
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
            await db.delete(activityPlans).where(eq(activityPlans.id, stale.id));
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
  await seedTemplates();
  console.log("\n✨ Sync complete!");
} catch (error) {
  console.error("\n💥 Sync failed:", error);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
