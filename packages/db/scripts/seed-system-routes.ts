#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  buildRouteFileArtifacts,
  inferRouteContentType,
  inferRouteFileExtension,
  ROUTES_BUCKET,
} from "../../api/src/lib/routes/route-file-helpers";
import { getApiStorageService } from "../../api/src/storage-service";
import { SYSTEM_ROUTE_TEMPLATES, type SystemRouteTemplate } from "../../core/samples";
import { activityPlans, activityRoutes } from "../src/schema/tables";
import { prepareDbEnv } from "./_helpers";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const noDelete = args.includes("--no-delete") || args.includes("--no-clear");
const verifyOnly = args.includes("--verify-only");
const databaseUrl = prepareDbEnv();
const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle({ client: pool, casing: "snake_case" });
const storageService = getApiStorageService();

const templates = SYSTEM_ROUTE_TEMPLATES;

type ExistingSystemRoute = typeof activityRoutes.$inferSelect;

function hasChanges(input: {
  existing: ExistingSystemRoute;
  template: SystemRouteTemplate;
  filePath: string;
  totalDistance: number;
  totalAscent: number;
  totalDescent: number;
  polyline: string;
  elevationPolyline: string | null;
}): boolean {
  const { elevationPolyline, existing, filePath, polyline, template } = input;

  if (existing.name !== template.name) return true;
  if ((existing.description ?? null) !== template.description) return true;
  if ((existing.file_path ?? null) !== filePath) return true;
  if (existing.total_distance !== input.totalDistance) return true;
  if ((existing.total_ascent ?? null) !== input.totalAscent) return true;
  if ((existing.total_descent ?? null) !== input.totalDescent) return true;
  if (existing.polyline !== polyline) return true;
  if ((existing.elevation_polyline ?? null) !== elevationPolyline) return true;
  if (existing.is_public !== true) return true;
  if (existing.is_system_template !== true) return true;
  if (existing.profile_id !== null) return true;

  return false;
}

async function downloadTemplateSource(
  template: SystemRouteTemplate,
): Promise<{ fileContent: string; fileExtension: string }> {
  const response = await fetch(template.download_url);
  if (!response.ok) {
    throw new Error(`Failed to download source (${response.status} ${response.statusText})`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  if (template.source_archive_format === "gpx") {
    return {
      fileContent: bytes.toString("utf8"),
      fileExtension: inferRouteFileExtension(template.download_url),
    };
  }

  const tempDir = await mkdtemp(join(tmpdir(), "gradientpeak-system-route-"));
  const zipPath = join(tempDir, `${template.id}.zip`);
  const extractedDir = join(tempDir, "extracted");

  try {
    await writeFile(zipPath, bytes);
    execFileSync("unzip", ["-o", zipPath, "-d", extractedDir], { stdio: "ignore" });

    const gpxFilePath = await findFirstGpxFile(extractedDir);
    if (!gpxFilePath) {
      throw new Error("Downloaded archive did not contain a GPX file");
    }

    return {
      fileContent: await readFile(gpxFilePath, "utf8"),
      fileExtension: "gpx",
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function findFirstGpxFile(rootDir: string): Promise<string | null> {
  const entries = await readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(rootDir, entry.name);

    if (entry.isDirectory()) {
      const nestedFile = await findFirstGpxFile(entryPath);
      if (nestedFile) {
        return nestedFile;
      }
      continue;
    }

    if (entry.name.toLowerCase().endsWith(".gpx")) {
      return entryPath;
    }
  }

  return null;
}

async function seedSystemRoutes() {
  console.log("🌱 Starting system route sync...");
  console.log(`   Mode: ${verifyOnly ? "VERIFY ONLY" : isDryRun ? "DRY RUN" : "LIVE"}`);
  console.log("   Filter: all verified routes");
  console.log(`   Local Routes: ${templates.length}\n`);

  const existingRoutes = await db
    .select()
    .from(activityRoutes)
    .where(eq(activityRoutes.is_system_template, true));

  const existingMap = new Map(existingRoutes.map((route) => [route.id, route]));
  const processedIds = new Set<string>();

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let deletedCount = 0;
  let errorCount = 0;

  for (const template of templates) {
    processedIds.add(template.id);

    try {
      console.log(`⬇️  Downloading "${template.name}"...`);
      const downloaded = await downloadTemplateSource(template);
      const fileContent = downloaded.fileContent;
      const artifacts = buildRouteFileArtifacts(fileContent);
      const extension = downloaded.fileExtension;
      const filePath = `system/${template.id}.${extension}`;
      const existing = existingMap.get(template.id);

      if (
        existing &&
        !hasChanges({
          existing,
          template,
          filePath,
          totalDistance: artifacts.totalDistance,
          totalAscent: artifacts.totalAscent,
          totalDescent: artifacts.totalDescent,
          polyline: artifacts.polyline,
          elevationPolyline: artifacts.elevationPolyline,
        })
      ) {
        skippedCount += 1;
        continue;
      }

      if (!isDryRun && !verifyOnly) {
        await storageService.storage.from(ROUTES_BUCKET).upload(filePath, fileContent, {
          contentType: inferRouteContentType(`route.${extension}`),
          upsert: true,
        });

        if (existing) {
          await db
            .update(activityRoutes)
            .set({
              updated_at: new Date(),
              name: template.name,
              description: template.description,
              file_path: filePath,
              total_distance: artifacts.totalDistance,
              total_ascent: artifacts.totalAscent,
              total_descent: artifacts.totalDescent,
              polyline: artifacts.polyline,
              elevation_polyline: artifacts.elevationPolyline,
              is_public: true,
              is_system_template: true,
              profile_id: null,
            })
            .where(eq(activityRoutes.id, template.id));
        } else {
          const now = new Date();
          await db.insert(activityRoutes).values({
            id: template.id,
            created_at: now,
            updated_at: now,
            profile_id: null,
            name: template.name,
            description: template.description,
            file_path: filePath,
            total_distance: artifacts.totalDistance,
            total_ascent: artifacts.totalAscent,
            total_descent: artifacts.totalDescent,
            elevation_polyline: artifacts.elevationPolyline,
            polyline: artifacts.polyline,
            is_system_template: true,
            is_public: true,
          });
        }
      }

      if (existing) {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }
    } catch (error) {
      console.error(`❌ Error processing "${template.name}":`, error);
      errorCount += 1;
    }
  }

  const staleRoutes = existingRoutes.filter((route) => !processedIds.has(route.id));
  if (staleRoutes.length > 0 && !noDelete) {
    for (const stale of staleRoutes) {
      if (!isDryRun) {
        const linkedPlans = await db
          .select({ id: activityPlans.id })
          .from(activityPlans)
          .where(eq(activityPlans.route_id, stale.id))
          .limit(1);

        if (linkedPlans.length === 0) {
          await db.delete(activityRoutes).where(eq(activityRoutes.id, stale.id));
          await storageService.storage.from(ROUTES_BUCKET).remove([stale.file_path]);
          deletedCount += 1;
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
    process.exitCode = 1;
  }
}

try {
  await seedSystemRoutes();
  console.log("\n✨ Sync complete!");
} catch (error) {
  console.error("\n💥 Sync failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
