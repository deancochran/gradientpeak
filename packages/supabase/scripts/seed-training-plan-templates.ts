#!/usr/bin/env tsx
/**
 * Seed script to upload system training plan templates to the database
 *
 * Usage:
 *   pnpm seed-training-plans                    # Sync all training plan templates
 *   pnpm seed-training-plans --type=periodized  # Sync only periodized plans
 *   pnpm seed-training-plans --dry-run          # Preview changes without applying
 *   pnpm seed-training-plans --no-delete        # Don't delete templates not in code
 *
 * This script uses a "smart sync" approach:
 * 1. Fetches existing system training plan templates from the database
 * 2. Compares them with the local code definitions (by static ID)
 * 3. Creates new templates if they don't exist
 * 4. Updates existing templates if fields (structure, description, etc.) have changed
 * 5. Deletes database templates that are no longer in the code (unless --no-delete is used)
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import {
  SAMPLE_TRAINING_PLANS,
  SAMPLE_TRAINING_PLANS_BY_TYPE,
} from "../../core/samples";
import type { TrainingPlanCreate } from "../../core/schemas/training_plan_structure";

// Load environment variables from root .env.local
config({ path: resolve(__dirname, "../.env.local") });

// Parse CLI arguments
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const noDelete = args.includes("--no-delete") || args.includes("--no-clear");
const typeArg = args.find((arg) => arg.startsWith("--type="));
const planType = typeArg?.split("=")[1] as
  | "periodized"
  | "maintenance"
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

const TEMPLATES = planType
  ? SAMPLE_TRAINING_PLANS_BY_TYPE[planType]
  : SAMPLE_TRAINING_PLANS;

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
function hasChanges(local: TrainingPlanCreate, remote: any): boolean {
  // Normalize fields (DB might return null for undefined)
  const localDescription = local.description ?? null;
  const remoteDescription = remote.description ?? null;

  // Compare core metadata
  if (local.name !== remote.name) {
    console.log(`   Field change: name`);
    return true;
  }

  if (localDescription !== remoteDescription) {
    console.log(`   Field change: description`);
    return true;
  }

  if (local.is_active !== remote.is_active) {
    console.log(`   Field change: is_active`);
    return true;
  }

  // Sanitize local structure to match JSON behavior
  const localStructureJson = JSON.parse(JSON.stringify(local.structure));

  // Compare structure object deeply
  if (!deepEqual(localStructureJson, remote.structure)) {
    console.log(`   Field change: structure`);
    return true;
  }

  return false;
}

async function seedTrainingPlanTemplates() {
  console.log("🌱 Starting training plan template sync...");
  console.log(`   Mode: ${isDryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`   Filter: ${planType ? `${planType} only` : "all"}`);
  console.log(`   Local Templates: ${TEMPLATES.length}\n`);

  // 1. Fetch existing system templates from DB
  let query = supabase
    .from("training_plans")
    .select("*")
    .eq("is_system_template", true);

  // If we are only syncing one type, we could filter by structure.plan_type
  // However, for simplicity and to handle deletions properly, we fetch all system templates
  // and filter locally if needed

  const { data: existingTemplates, error } = await query;

  if (error) {
    console.error("❌ Failed to fetch existing templates:", error.message);
    process.exit(1);
  }

  // Check for duplicate IDs in DB
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
              .from("training_plans")
              .update({
                name: template.name,
                description: template.description,
                structure: template.structure,
                is_active: template.is_active,
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
            .from("training_plans")
            .insert({
              id: template.id, // Use the static ID
              profile_id: null,
              is_system_template: true,
              name: template.name,
              description: template.description,
              structure: template.structure,
              is_active: template.is_active,
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
            .from("training_plans")
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

seedTrainingPlanTemplates()
  .then(() => {
    console.log("\n✨ Sync complete!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n💥 Sync failed:", err);
    process.exit(1);
  });
