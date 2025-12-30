#!/usr/bin/env tsx
/**
 * Seed script to upload system templates to the database
 *
 * Usage:
 *   pnpm seed-templates                    # Sync all templates
 *   pnpm seed-templates --category=bike    # Sync only bike templates
 *   pnpm seed-templates --dry-run          # Preview changes without applying
 *   pnpm seed-templates --no-delete        # Don't delete templates not in code
 *
 * This script uses a "smart sync" approach:
 * 1. Fetches existing system templates from the database
 * 2. Compares them with the local code definitions (by static ID)
 * 3. Creates new templates if they don't exist
 * 4. Updates existing templates if fields (structure, description, etc.) have changed
 * 5. Deletes database templates that are no longer in the code (unless --no-delete is used)
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import {
  SYSTEM_TEMPLATES,
  getTemplatesByCategory,
  type SystemTemplate,
} from "../../core/samples";

// Load environment variables from root .env.local
config({ path: resolve(__dirname, "../.env.local") });

// Parse CLI arguments
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const noDelete = args.includes("--no-delete") || args.includes("--no-clear");
const categoryArg = args.find((arg) => arg.startsWith("--category="));
const category = categoryArg?.split("=")[1] as
  | SystemTemplate["activity_category"]
  | undefined;

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error(
    "❌ Missing environment variables: SUPABASE_URL or SUPABASE_SECRET_KEY",
  );
  console.error("   Please check your .env.local file.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

const TEMPLATES = category
  ? getTemplatesByCategory(category)
  : SYSTEM_TEMPLATES;

/**
 * Strip IDs from structure object for comparison
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripIds(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(stripIds);
  }

  if (obj !== null && typeof obj === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      if (key !== "id") {
        newObj[key] = stripIds(obj[key]);
      }
    }
    return newObj;
  }

  return obj;
}

/**
 * Deep equality check for objects and arrays
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;

  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  ) {
    return false;
  }

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
}

/**
 * Check if a local template differs from the remote DB record
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasChanges(local: SystemTemplate, remote: any): boolean {
  // Normalize fields (DB might return null for undefined)
  const localRouteId = local.route_id ?? null;
  const remoteRouteId = remote.route_id ?? null;

  const localNotes = local.notes ?? null;
  const remoteNotes = remote.notes ?? null;

  // Compare core metadata
  if (local.version !== remote.version) {
    if (local.name === "Sweet Spot Intervals")
      console.log(
        `DEBUG: version mismatch: '${local.version}' vs '${remote.version}'`,
      );
    return true;
  }
  if (local.name !== remote.name) return true; // Should match if we looked it up by name, but safely check
  if (local.description !== remote.description) {
    if (local.name === "Sweet Spot Intervals") {
      console.log("DEBUG: description mismatch");
      console.log(`   LOCAL: '${local.description}'`);
      console.log(`   REMOTE: '${remote.description}'`);
    }
    return true;
  }
  if (local.activity_category !== remote.activity_category) {
    if (local.name === "Sweet Spot Intervals")
      console.log("DEBUG: activity_category mismatch");
    return true;
  }
  if (local.activity_location !== remote.activity_location) {
    if (local.name === "Sweet Spot Intervals")
      console.log("DEBUG: activity_location mismatch");
    return true;
  }
  if (localRouteId !== remoteRouteId) {
    if (local.name === "Sweet Spot Intervals")
      console.log("DEBUG: route_id mismatch");
    return true;
  }
  if (localNotes !== remoteNotes) {
    if (local.name === "Sweet Spot Intervals")
      console.log("DEBUG: notes mismatch");
    return true;
  }

  // Sanitize local structure to match JSON behavior (strip undefined, functions, etc.)
  // This ensures comparison is fair against the JSON returned from the database.
  const localStructureJson = JSON.parse(JSON.stringify(local.structure));

  // Strip IDs from both structures before comparing
  // PlanBuilder generates new IDs on every run, so we can't compare them
  const localClean = stripIds(localStructureJson);
  const remoteClean = stripIds(remote.structure);

  // Compare structure object deeply
  if (!deepEqual(localClean, remoteClean)) {
    if (local.name === "Sweet Spot Intervals") {
      console.log("🔍 DEBUG: Structure mismatch for", local.name);
      console.log("LOCAL:", JSON.stringify(localClean, null, 2));
      console.log("REMOTE:", JSON.stringify(remoteClean, null, 2));
    }
    return true;
  }

  return false;
}

async function seedTemplates() {
  console.log("🌱 Starting template sync...");
  console.log(`   Mode: ${isDryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`   Filter: ${category ? `${category} only` : "all"}`);
  console.log(`   Local Templates: ${TEMPLATES.length}\n`);

  // 1. Fetch existing system templates from DB
  let query = supabase
    .from("activity_plans")
    .select("*")
    .eq("is_system_template", true);

  // If we are only syncing one category, ideally we'd only fetch that category.
  // However, to detect deletions efficiently, it's safer to fetch based on our sync scope.
  if (category) {
    query = query.eq("activity_category", category);
  }

  const { data: existingTemplates, error } = await query;

  if (error) {
    console.error("❌ Failed to fetch existing templates:", error.message);
    process.exit(1);
  }

  // Check for duplicate IDs in DB (shouldn't happen with unique constraint, but good to check)
  const idCounts = new Map<string, number>();
  existingTemplates.forEach((t) => {
    idCounts.set(t.id, (idCounts.get(t.id) || 0) + 1);
  });

  for (const [id, count] of idCounts.entries()) {
    if (count > 1) {
      console.warn(
        `⚠️  WARNING: Duplicate template ID found in DB: "${id}" (${count} occurrences)`,
      );
    }
  }

  // Map for quick lookup: ID -> DB Record
  const existingMap = new Map(existingTemplates.map((t) => [t.id, t]));
  const processedIds = new Set<string>();

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let deletedCount = 0;
  let errorCount = 0;

  // 2. Iterate through local templates to Create or Update
  for (const template of TEMPLATES) {
    if (!template.id) {
      console.error(
        `❌ Template "${template.name}" is missing a static ID. Skipping.`,
      );
      errorCount++;
      continue;
    }

    processedIds.add(template.id);
    const existing = existingMap.get(template.id);

    try {
      if (existing) {
        // Template exists - check if it needs update
        if (hasChanges(template, existing)) {
          console.log(`📝 Updating "${template.name}" (${template.id})...`);
          if (!isDryRun) {
            const { error: updateError } = await supabase
              .from("activity_plans")
              .update({
                version: template.version,
                name: template.name, // Update name if it changed
                description: template.description,
                activity_category: template.activity_category,
                activity_location: template.activity_location,
                structure: template.structure,
                route_id: template.route_id,
                notes: template.notes,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id);

            if (updateError) throw updateError;
          }
          updatedCount++;
        } else {
          // No changes
          skippedCount++;
        }
      } else {
        // Template does not exist - Create it
        console.log(`✨ Creating "${template.name}" (${template.id})...`);
        if (!isDryRun) {
          const { error: insertError } = await supabase
            .from("activity_plans")
            .insert({
              id: template.id, // Use the static ID
              profile_id: null,
              is_system_template: true,
              version: template.version,
              name: template.name,
              description: template.description,
              activity_category: template.activity_category,
              activity_location: template.activity_location,
              structure: template.structure,
              route_id: template.route_id,
              notes: template.notes,
            });

          if (insertError) throw insertError;
        }
        createdCount++;
      }
    } catch (err) {
      console.error(`❌ Error processing "${template.name}":`, err);
      errorCount++;
    }
  }

  // 3. Handle Deletions
  // Any existing template that was not processed means it's no longer in the local code
  const staleTemplates = existingTemplates.filter(
    (t) => !processedIds.has(t.id),
  );

  if (staleTemplates.length > 0) {
    console.log(`\nFound ${staleTemplates.length} stale template(s).`);
    if (noDelete) {
      console.log("   Skipping deletion (--no-delete active).");
    } else {
      for (const stale of staleTemplates) {
        console.log(`🗑️  Deleting "${stale.name}" (${stale.id})...`);
        if (!isDryRun) {
          const { error: deleteError } = await supabase
            .from("activity_plans")
            .delete()
            .eq("id", stale.id);

          if (deleteError) {
            console.error(
              `❌ Failed to delete "${stale.name}":`,
              deleteError.message,
            );
            errorCount++;
          } else {
            deletedCount++;
          }
        } else {
          deletedCount++;
        }
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
    process.exit(1);
  }
}

seedTemplates()
  .then(() => {
    console.log("\n✨ Sync complete!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n💥 Sync failed:", err);
    process.exit(1);
  });
