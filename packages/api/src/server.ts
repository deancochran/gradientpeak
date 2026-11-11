import type { DrizzleDbClient } from "@repo/db";

import {
  type HandleOAuthCallbackInput,
  type HandleOAuthCallbackResult,
  handleOAuthCallback as handleOAuthCallbackUseCase,
} from "./application/integrations";
import { createIntegrationsRepositories } from "./infrastructure/repositories";

export type { HandleOAuthCallbackResult };
export type HandleOAuthCallbackRequest = Omit<
  HandleOAuthCallbackInput,
  "enqueueProviderJobInTransaction" | "repositories" | "runInTransaction"
> & { db: DrizzleDbClient };

export function handleOAuthCallback({ db, ...input }: HandleOAuthCallbackRequest) {
  return handleOAuthCallbackUseCase({
    db,
    ...input,
    repositories: createIntegrationsRepositories(db),
    runInTransaction: (operation) => db.transaction(operation),
  });
}
export { createApiContext } from "./context";
export { CONTRACT_EPOCH_HEADER, CURRENT_CONTRACT_EPOCH } from "./contract-epoch";
export { createStravaRepository } from "./infrastructure/repositories/drizzle-strava-repository";
export { isStravaIntegrationEnabled } from "./lib/integrations/oauth-config";
export { getDefaultMobileOAuthRedirect } from "./lib/integrations/oauth-redirect";
export { StravaActivityHistoryJobService } from "./lib/provider-sync/strava-activity-history-job-service";
export { createStravaProviderRuntime } from "./lib/provider-sync/strava-provider-runtime";
export { StravaWebhookJobService } from "./lib/provider-sync/strava-webhook-job-service";
export type { AppRouter } from "./routers";
export { appRouter } from "./routers";
export { getApiStorageService } from "./storage-service";
