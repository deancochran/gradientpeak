#!/usr/bin/env tsx

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getTemplatesByCategory, SYSTEM_TEMPLATES, type SystemTemplate } from "../../core/samples";
import { activityPlans } from "../src/schema/tables";
import { deepEqual, prepareDbEnv, stripIds } from "./_helpers";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const noDelete = args.includes("--no-delete") || args.includes("--no-clear");
const categoryArg = args.find((arg) => arg.startsWith("--category="));
const category = categoryArg
  ? (categoryArg.slice("--category=".length) as SystemTemplate["activity_category"])
  : undefined;

const databaseUrl = prepareDbEnv();
const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle({ client: pool, casing: "snake_case" });

const templates = category ? getTemplatesByCategory(category) : SYSTEM_TEMPLATES;

type ExistingActivityTemplate = typeof activityPlans.$inferSelect;

function hasChanges(local: SystemTemplate, remote: ExistingActivityTemplate): boolean {
  if (local.version !== remote.version) return true;
  if (local.name !== remote.name) return true;
  if (local.description !== (remote.description ?? null)) return true;
  if (local.activity_category !== remote.activity_category) return true;
  if ((local.route_id ?? null) !== (remote.route_id ?? null)) return true;
  if ((local.notes ?? null) !== (remote.notes ?? null)) return true;

  const localStructure = stripIds(JSON.parse(JSON.stringify(local.structure)));
  const remoteStructure = stripIds(remote.structure);

  return !deepEqual(localStructure, remoteStructure);
}

async function seedTemplates() {
  console.log("🌱 Starting template sync...");
  console.log(`   Mode: ${isDryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`   Filter: ${category ? `${category} only` : "all"}`);
  console.log(`   Local Templates: ${templates.length}\n`);

  const existingTemplates = await db
    .select()
    .from(activityPlans)
    .where(
      category
        ? and(
            eq(activityPlans.is_system_template, true),
            eq(activityPlans.activity_category, category),
          )
        : eq(activityPlans.is_system_template, true),
    );

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
              .update(activityPlans)
              .set({
                version: template.version,
                name: template.name,
                description: template.description,
                activity_category: template.activity_category,
                structure: template.structure,
                route_id: template.route_id ?? null,
                notes: template.notes ?? null,
                template_visibility: "public",
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
            id: template.id,
            profile_id: null,
            is_system_template: true,
            template_visibility: "public",
            version: template.version,
            name: template.name,
            description: template.description,
            activity_category: template.activity_category,
            structure: template.structure,
            route_id: template.route_id ?? null,
            notes: template.notes ?? null,
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
  await pool.end();
}
