import {
  createActivityImporter,
  createProviderSyncRepository,
  createWahooImportFitFileStorage,
  createWahooRepository,
  createWahooRouteStorage,
  WahooSyncJobService,
  WahooSyncService,
  WahooWebhookJobService,
} from "@repo/api/webhooks";
import { db } from "@repo/db/client";
import { createClient } from "@supabase/supabase-js";

const serverSupabaseUrl =
  process.env.NEXT_PRIVATE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;

export function createWahooSyncRuntime() {
  const supabase = createClient(serverSupabaseUrl!, process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY!);

  const wahooRepository = createWahooRepository({ db });
  const providerSyncRepository = createProviderSyncRepository({ db });
  const importer = createActivityImporter({
    repository: wahooRepository,
    fitFileStorage: createWahooImportFitFileStorage({
      async uploadFitFile(input) {
        const { error } = await supabase.storage.from("fit-files").upload(input.path, input.bytes, {
          contentType: input.contentType,
          upsert: false,
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
    syncJobs: new WahooSyncJobService({
      providerSyncRepository,
      syncService,
      wahooRepository,
    }),
    webhookJobs: new WahooWebhookJobService({
      importer,
      providerSyncRepository,
      wahooRepository,
    }),
    wahooRepository,
  };
}
