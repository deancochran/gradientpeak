import {
  AthleteStateWorkerService,
  createActivityImporter,
  createActivityImportRepository,
  createWahooImportActivityFileStorage,
  createWahooRepository,
  createWahooRouteStorage,
  createWahooStagingCleanupReservation,
  createWahooSyncRepository,
  getProcessWahooSyncLimiter,
  isWahooIntegrationEnabled,
  readPublishedAthletePerformanceTargets,
  submitImportedActivityArtifact,
  WahooActivityHistoryJobService,
  WahooSyncJobService,
  WahooSyncService,
  WahooWebhookJobService,
} from "@repo/api/webhooks";
import { schema } from "@repo/db";
import { db } from "@repo/db/client";
import { createClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { getWahooSyncRequestTimeoutMs } from "../../scripts/wahoo-sync-config.mjs";
import { createBoundedFetch } from "./bounded-fetch";

const serverSupabaseUrl =
  process.env.NEXT_PRIVATE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;

function boundedInteger(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export function getWahooDrainConfig() {
  return {
    concurrency: boundedInteger(process.env.WAHOO_PROVIDER_SYNC_CONCURRENCY, 4, 16),
    leaseMs: boundedInteger(process.env.WAHOO_PROVIDER_SYNC_LEASE_MS, 10 * 60_000, 30 * 60_000),
    limit: boundedInteger(process.env.WAHOO_PROVIDER_SYNC_DRAIN_LIMIT, 20, 100),
    requestTimeoutMs: getWahooSyncRequestTimeoutMs(process.env),
  };
}

type RouteStorageClient = {
  from(bucket: string): {
    download(filePath: string): Promise<{ data: Blob | null; error: unknown }>;
  };
};

function isDefiniteStorageNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (("status" in error && (error.status === 404 || error.status === "404")) ||
      ("statusCode" in error && (error.statusCode === 404 || error.statusCode === "404")))
  );
}

export function createSupabaseWahooRouteStorage(storage: RouteStorageClient) {
  return createWahooRouteStorage({
    async downloadRouteGpx(filePath) {
      const { data, error } = await storage.from("gpx-routes").download(filePath);
      if (error) {
        if (isDefiniteStorageNotFound(error)) return null;
        throw error;
      }
      if (!data) {
        throw new Error("Route storage download returned no data");
      }
      return data.text();
    },
  });
}

export function createWahooSyncRuntime() {
  if (!isWahooIntegrationEnabled()) throw new Error("Wahoo integration is disabled");
  const config = getWahooDrainConfig();
  const executionLimiter = getProcessWahooSyncLimiter(config.concurrency);
  const serverSupabaseSecretKey = process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY;
  if (!serverSupabaseUrl || !serverSupabaseSecretKey) {
    throw new Error("Wahoo sync runtime requires server-side Supabase configuration");
  }
  const createBoundedSupabaseClient = (operationSignal?: AbortSignal) =>
    createClient(serverSupabaseUrl, serverSupabaseSecretKey, {
      // Supabase forwards global.fetch to its Storage client. The request timer
      // is capped at nine seconds, far below the 45-minute cleanup grace.
      global: {
        fetch: createBoundedFetch({
          ...(operationSignal === undefined ? {} : { operationSignal }),
          timeoutMs: config.requestTimeoutMs,
        }),
      },
    });
  const supabase = createBoundedSupabaseClient();

  const wahooRepository = createWahooRepository({ db });
  const providerSyncRepository = createWahooSyncRepository({ db });
  const activityImportRepository = createActivityImportRepository(db);
  const getPerformanceTargets = ({ profileId }: { profileId: string }) =>
    readPublishedAthletePerformanceTargets({ db, profileId });
  const importer = createActivityImporter({
    allowedActivityFileHosts: process.env.WAHOO_ACTIVITY_FILE_ALLOWED_HOSTS?.split(",")
      .map((host) => host.trim())
      .filter(Boolean),
    repository: wahooRepository,
    generationGuard: async (tx, expected) => {
      const [activeIntegration] = await tx
        .select({ id: schema.integrations.id })
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.id, expected.integrationId),
            eq(schema.integrations.profile_id, expected.profileId),
            eq(schema.integrations.provider, "wahoo"),
            eq(schema.integrations.lifecycle_status, "active"),
            eq(schema.integrations.generation, expected.integrationGeneration),
          ),
        )
        .limit(1)
        .for("share");
      if (!activeIntegration) throw new Error("integration_generation_inactive");
    },
    stagingCleanup: createWahooStagingCleanupReservation({ providerSyncRepository }),
    submitActivity: (activity, parsedActivity, options) =>
      submitImportedActivityArtifact(db, {
        activity,
        artifactSha256: options.artifactSha256,
        beforePersist: options.beforePersist,
        ...(options.importRunId ? { importRunId: options.importRunId } : {}),
        ...(options.deferAthleteStateRefresh ? { deferAthleteStateRefresh: true } : {}),
        ...(options.deferPerformanceCalibration ? { deferPerformanceCalibration: true } : {}),
        parsedActivity,
      }),
    activityFileStorage: createWahooImportActivityFileStorage({
      async readActivityFile(path) {
        const { data, error } = await supabase.storage.from("activity-files").download(path);
        if (error || !data) return null;
        const bytes = new Uint8Array(await data.arrayBuffer());
        return { bytes, size: bytes.byteLength };
      },
      async uploadActivityFile(input) {
        const { error: bucketError } = await supabase.storage.createBucket("activity-files", {
          public: false,
          fileSizeLimit: "50MB",
        });

        if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) {
          throw bucketError;
        }

        const { error } = await supabase.storage
          .from("activity-files")
          .upload(input.path, input.bytes, {
            contentType: input.contentType,
            upsert: true,
          });

        if (error) {
          throw error;
        }
      },
      async removeOwnedActivityFile(path) {
        const { error } = await supabase.storage.from("activity-files").remove([path]);
        if (error) {
          throw error;
        }
        return { cleanupPending: false, removed: true };
      },
    }),
  });

  const syncService = new WahooSyncService({
    getPerformanceTargets,
    repository: wahooRepository,
    storage: createSupabaseWahooRouteStorage(supabase.storage),
  });

  return {
    activityHistoryJobs: new WahooActivityHistoryJobService({
      db,
      executionLimiter,
      importRuns: activityImportRepository,
      importer,
      providerSyncRepository,
      wahooRepository,
    }),
    syncJobs: new WahooSyncJobService({
      db,
      executionLimiter,
      providerSyncRepository,
      syncService,
      async removeWahooStagingObject(path, signal) {
        const cleanupSupabase = createBoundedSupabaseClient(signal);
        const { error } = await cleanupSupabase.storage.from("activity-files").remove([path]);
        if (error && !isDefiniteStorageNotFound(error)) throw error;
      },
      wahooRepository,
    }),
    webhookJobs: new WahooWebhookJobService({
      executionLimiter,
      importer,
      providerSyncRepository,
      wahooRepository,
    }),
    wahooRepository,
  };
}

export function createAthleteStateRuntime() {
  return {
    athleteStateJobs: new AthleteStateWorkerService({ db }),
  };
}

export { isWahooIntegrationEnabled };
