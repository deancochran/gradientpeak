import {
  createActivityImporter,
  createProviderSyncRepository,
  createWahooImportActivityFileStorage,
  createWahooRepository,
  createWahooRouteStorage,
  enrichImportedActivityArtifact,
  getProcessProviderSyncLimiter,
  submitImportedActivityArtifact,
  WahooActivityHistoryJobService,
  WahooSyncJobService,
  WahooSyncService,
  WahooWebhookJobService,
} from "@repo/api/webhooks";
import { db } from "@repo/db/client";
import { createClient } from "@supabase/supabase-js";
import { getProviderSyncRequestTimeoutMs } from "../../scripts/provider-sync-config.mjs";

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
    requestTimeoutMs: getProviderSyncRequestTimeoutMs(process.env),
  };
}

type RouteStorageClient = {
  from(bucket: string): {
    download(filePath: string): Promise<{ data: Blob | null; error: unknown }>;
  };
};

function isDefiniteStorageNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}

export function createSupabaseWahooRouteStorage(storage: RouteStorageClient) {
  return createWahooRouteStorage({
    async downloadRouteGpx(filePath) {
      const { data, error } = await storage.from("routes").download(filePath);
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
  const config = getWahooDrainConfig();
  const executionLimiter = getProcessProviderSyncLimiter(config.concurrency);
  const serverSupabaseSecretKey = process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY;
  if (!serverSupabaseUrl || !serverSupabaseSecretKey) {
    throw new Error("Wahoo sync runtime requires server-side Supabase configuration");
  }
  const supabase = createClient(serverSupabaseUrl, serverSupabaseSecretKey);

  const wahooRepository = createWahooRepository({ db });
  const providerSyncRepository = createProviderSyncRepository({ db });
  const importer = createActivityImporter({
    allowedActivityFileHosts: process.env.WAHOO_ACTIVITY_FILE_ALLOWED_HOSTS?.split(",")
      .map((host) => host.trim())
      .filter(Boolean),
    repository: wahooRepository,
    submitActivity: (activity, parsedActivity) =>
      submitImportedActivityArtifact(db, { activity, parsedActivity }),
    enrichActivity: (activityId, activity, parsedActivity) =>
      enrichImportedActivityArtifact(db, { activityId, activity, parsedActivity }),
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
    }),
  });

  const syncService = new WahooSyncService({
    repository: wahooRepository,
    storage: createSupabaseWahooRouteStorage(supabase.storage),
  });

  return {
    activityHistoryJobs: new WahooActivityHistoryJobService({
      executionLimiter,
      importer,
      providerSyncRepository,
      wahooRepository,
    }),
    syncJobs: new WahooSyncJobService({
      executionLimiter,
      providerSyncRepository,
      syncService,
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
