#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  buildRouteFileArtifacts,
  ROUTES_BUCKET,
} from "../../api/src/lib/routes/route-file-helpers";
import { getApiStorageService } from "../../api/src/storage-service";
import {
  getSystemRoutesByCategory,
  SYSTEM_ROUTE_TEMPLATES,
  type SystemRouteTemplate,
} from "../../core/samples";
import { activityPlans, activityRoutes } from "../src/schema/tables";
import { prepareDbEnv } from "./_helpers";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const noDelete = args.includes("--no-delete") || args.includes("--no-clear");
const verifyOnly = args.includes("--verify-only");
const categoryArg = args.find((arg) => arg.startsWith("--category="));
const category = categoryArg
  ? (categoryArg.slice("--category=".length) as SystemRouteTemplate["activity_category"])
  : undefined;

const databaseUrl = prepareDbEnv();
const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle({ client: pool, casing: "snake_case" });

const templates = category ? getSystemRoutesByCategory(category) : SYSTEM_ROUTE_TEMPLATES;

type ExistingSystemRoute = typeof activityRoutes.$inferSelect;

interface DownloadedRouteSource {
  extractedFileName: string;
  fileContent: string;
}

let storageServiceSingleton: ReturnType<typeof getApiStorageService> | null = null;

function getStorageService() {
  if (!storageServiceSingleton) {
    storageServiceSingleton = getApiStorageService();
  }

  return storageServiceSingleton;
}

function hasChanges(input: {
  existing: ExistingSystemRoute;
  template: SystemRouteTemplate;
  filePath: string;
  checksumSha256: string;
  totalDistance: number;
  totalAscent: number;
  totalDescent: number;
  polyline: string;
  elevationPolyline: string | null;
}): boolean {
  const { elevationPolyline, existing, filePath, polyline, template } = input;

  if (existing.name !== template.name) return true;
  if ((existing.description ?? null) !== template.description) return true;
  if (existing.activity_category !== template.activity_category) return true;
  if ((existing.source ?? null) !== template.source_provider) return true;
  if ((existing.source_page_url ?? null) !== template.source_page_url) return true;
  if ((existing.source_download_url ?? null) !== template.source_download_url) return true;
  if ((existing.source_license ?? null) !== (template.source_license ?? null)) return true;
  if ((existing.source_attribution ?? null) !== (template.source_attribution ?? null)) return true;
  if ((existing.import_provider ?? null) !== template.source_provider) return true;
  if ((existing.import_external_id ?? null) !== template.import_external_id) return true;
  if ((existing.file_path ?? null) !== filePath) return true;
  if ((existing.checksum_sha256 ?? null) !== input.checksumSha256) return true;
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
): Promise<DownloadedRouteSource> {
  const response = await fetch(template.source_download_url, {
    headers: {
      accept: "*/*",
      "user-agent": "GradientPeakSystemRouteSeeder/1.0 (+https://gradientpeak.local)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download source (${response.status} ${response.statusText})`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  if (template.source_archive_format === "gpx") {
    return {
      extractedFileName: `${template.import_external_id}.gpx`,
      fileContent: bytes.toString("utf8"),
    };
  }

  const tempDir = await mkdtemp(join(tmpdir(), "gradientpeak-system-route-"));
  const zipPath = join(tempDir, `${template.id}.zip`);
  const extractedDir = join(tempDir, "extracted");

  try {
    await writeFile(zipPath, bytes);

    execFileSync("unzip", ["-o", zipPath, "-d", extractedDir], {
      stdio: "ignore",
    });

    const gpxFilePath = await findFirstGpxFile(extractedDir);
    if (!gpxFilePath) {
      throw new Error("Downloaded archive did not contain a GPX file");
    }

    return {
      extractedFileName: gpxFilePath.split("/").pop() || `${template.import_external_id}.gpx`,
      fileContent: await readFile(gpxFilePath, "utf8"),
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
  console.log(`   Filter: ${category ? `${category} only` : "all verified routes"}`);
  console.log(`   Local Routes: ${templates.length}\n`);

  if (verifyOnly) {
    let verifiedCount = 0;
    let errorCount = 0;

    for (const template of templates) {
      try {
        console.log(`⬇️  Verifying \"${template.name}\"...`);
        const downloaded = await downloadTemplateSource(template);
        const artifacts = buildRouteFileArtifacts(downloaded.fileContent);
        console.log(
          `   ✓ ${downloaded.extractedFileName} | ${artifacts.totalDistance}m | +${artifacts.totalAscent}m | ${artifacts.parsed.coordinates.length} points`,
        );
        verifiedCount += 1;
      } catch (error) {
        console.error(`❌ Verification failed for \"${template.name}\":`, error);
        errorCount += 1;
      }
    }

    console.log("\n📊 Verification Summary:");
    console.log(`   ✓ Verified: ${verifiedCount}`);
    console.log(`   ❌ Errors:   ${errorCount}`);

    if (errorCount > 0) {
      process.exitCode = 1;
    }

    return;
  }

  const existingRoutes = await db
    .select()
    .from(activityRoutes)
    .where(
      category
        ? and(
            eq(activityRoutes.is_system_template, true),
            eq(activityRoutes.activity_category, category),
          )
        : eq(activityRoutes.is_system_template, true),
    );

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
      console.log(`⬇️  Downloading \"${template.name}\"...`);
      const downloaded = await downloadTemplateSource(template);
      console.log(`   Source file: ${downloaded.extractedFileName}`);
      const artifacts = buildRouteFileArtifacts(downloaded.fileContent);
      const filePath = `system/${template.id}.gpx`;
      const existing = existingMap.get(template.id);

      if (
        existing &&
        !hasChanges({
          checksumSha256: artifacts.checksumSha256,
          elevationPolyline: artifacts.elevationPolyline,
          existing,
          filePath,
          polyline: artifacts.polyline,
          template,
          totalAscent: artifacts.totalAscent,
          totalDescent: artifacts.totalDescent,
          totalDistance: artifacts.totalDistance,
        })
      ) {
        skippedCount += 1;
        continue;
      }

      if (!isDryRun) {
        const { error: uploadError } = await getStorageService()
          .storage.from(ROUTES_BUCKET)
          .upload(filePath, downloaded.fileContent, {
            contentType: "application/gpx+xml",
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Failed to upload route file: ${uploadError.message}`);
        }
      }

      const now = new Date();

      if (existing) {
        console.log(`📝 Updating \"${template.name}\" (${template.id})...`);

        if (!isDryRun) {
          await db
            .update(activityRoutes)
            .set({
              updated_at: now,
              profile_id: null,
              name: template.name,
              description: template.description,
              activity_category: template.activity_category,
              file_path: filePath,
              total_distance: artifacts.totalDistance,
              total_ascent: artifacts.totalAscent,
              total_descent: artifacts.totalDescent,
              source: template.source_provider,
              source_page_url: template.source_page_url,
              source_download_url: template.source_download_url,
              source_license: template.source_license ?? null,
              source_attribution: template.source_attribution ?? null,
              import_provider: template.source_provider,
              import_external_id: template.import_external_id,
              checksum_sha256: artifacts.checksumSha256,
              polyline: artifacts.polyline,
              elevation_polyline: artifacts.elevationPolyline,
              is_system_template: true,
              is_public: true,
            })
            .where(eq(activityRoutes.id, existing.id));
        }

        updatedCount += 1;
      } else {
        console.log(`✨ Creating \"${template.name}\" (${template.id})...`);

        if (!isDryRun) {
          await db.insert(activityRoutes).values({
            id: template.id,
            created_at: now,
            updated_at: now,
            profile_id: null,
            name: template.name,
            description: template.description,
            activity_category: template.activity_category,
            file_path: filePath,
            total_distance: artifacts.totalDistance,
            total_ascent: artifacts.totalAscent,
            total_descent: artifacts.totalDescent,
            source: template.source_provider,
            source_page_url: template.source_page_url,
            source_download_url: template.source_download_url,
            source_license: template.source_license ?? null,
            source_attribution: template.source_attribution ?? null,
            import_provider: template.source_provider,
            import_external_id: template.import_external_id,
            checksum_sha256: artifacts.checksumSha256,
            polyline: artifacts.polyline,
            elevation_polyline: artifacts.elevationPolyline,
            is_system_template: true,
            is_public: true,
          });
        }

        createdCount += 1;
      }
    } catch (error) {
      console.error(`❌ Error processing \"${template.name}\":`, error);
      errorCount += 1;
    }
  }

  const staleRoutes = existingRoutes.filter((route) => !processedIds.has(route.id));

  if (staleRoutes.length > 0) {
    console.log(`\nFound ${staleRoutes.length} stale system route(s).`);

    if (noDelete) {
      console.log("   Skipping deletion (--no-delete active).");
    } else {
      for (const stale of staleRoutes) {
        const [linkedPlans] = await db
          .select({ value: activityPlans.id })
          .from(activityPlans)
          .where(eq(activityPlans.route_id, stale.id))
          .limit(1);

        if (linkedPlans) {
          console.warn(
            `⚠️  Skipping stale route \"${stale.name}\" because activity plans still reference it.`,
          );
          continue;
        }

        console.log(`🗑️  Deleting \"${stale.name}\" (${stale.id})...`);

        if (!isDryRun) {
          await db.delete(activityRoutes).where(eq(activityRoutes.id, stale.id));

          if (stale.file_path) {
            await getStorageService().storage.from(ROUTES_BUCKET).remove([stale.file_path]);
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
  await seedSystemRoutes();
  console.log("\n✨ Sync complete!");
} catch (error) {
  console.error("\n💥 Sync failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
