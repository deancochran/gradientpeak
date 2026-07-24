import type { DrizzleDbClient } from "@repo/db";

import {
  type HandleOAuthCallbackInput,
  type HandleOAuthCallbackResult,
  handleOAuthCallback as handleOAuthCallbackUseCase,
} from "./application/integrations";
import {
  createIntegrationsRepositories,
  createProviderSyncRepository,
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
    providerSyncRepository: createProviderSyncRepository({ db }),
    runInTransaction: (operation) => db.transaction(operation),
  });
}
export { createApiContext } from "./context";
export type { AppRouter } from "./routers";
export { appRouter } from "./routers";
export { getApiStorageService } from "./storage-service";
