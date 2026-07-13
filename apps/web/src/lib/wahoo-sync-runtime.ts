import {
  createActivityImporter,
  createProviderSyncRepository,
  createWahooImportActivityFileStorage,
  createWahooRepository,
  createWahooRouteStorage,
  getProcessProviderSyncLimiter,
  submitActivity,
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
    repository: wahooRepository,
    submitActivity: (input) =>
      submitActivity(db, {
        ...input,
        notes: null,
        activityType: input.type,
        isPrivate: false,
        startedAt: new Date(input.startedAt),
        finishedAt: new Date(input.finishedAt),
        importSource: null,
        importFileType: "fit",
        importOriginalFileName: null,
        maxHeartRate: null,
        maxPower: null,
        maxCadence: null,
        maxSpeedMps: null,
        normalizedSpeedMps: null,
        normalizedGradedSpeedMps: null,
        efficiencyFactor: null,
        aerobicDecoupling: null,
        avgTemperature: null,
        deviceManufacturer: null,
        deviceProduct: null,
        laps: null,
        mapBounds: null,
        providerProvenance: {
          provider: input.provider,
          externalId: input.externalId,
          integrationId: input.integrationId,
          providerUpdatedAt: input.providerUpdatedAt,
        },
      }),
    activityFileStorage: createWahooImportActivityFileStorage({
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
    storage: createWahooRouteStorage({
      async downloadRouteGpx(filePath) {
        const { data, error } = await supabase.storage.from("routes").download(filePath);
        if (error || !data) return null;
        return data.text();
      },
    }),
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
