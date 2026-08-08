import type { DrizzleDbClient } from "@repo/db";

import {
  type HandleOAuthCallbackInput,
  type HandleOAuthCallbackResult,
  handleOAuthCallback as handleOAuthCallbackUseCase,
} from "./application/integrations";
import {
  createIntegrationsRepositories,
  createWahooSyncRepository,
} from "./infrastructure/repositories";

export type { HandleOAuthCallbackResult };
export type HandleOAuthCallbackRequest = Omit<
  HandleOAuthCallbackInput,
  "repositories" | "providerSyncRepository" | "runInTransaction"
> & { db: DrizzleDbClient };

export function handleOAuthCallback({ db, ...input }: HandleOAuthCallbackRequest) {
  return handleOAuthCallbackUseCase({
    ...input,
    repositories: createIntegrationsRepositories(db),
    providerSyncRepository: createWahooSyncRepository({ db }),
    runInTransaction: (operation) => db.transaction(operation),
  });
}
export { createApiContext } from "./context";
export { CONTRACT_EPOCH_HEADER, CURRENT_CONTRACT_EPOCH } from "./contract-epoch";
export { getDefaultMobileOAuthRedirect } from "./lib/integrations/oauth-redirect";
export type { AppRouter } from "./routers";
export { appRouter } from "./routers";
export { getApiStorageService } from "./storage-service";
