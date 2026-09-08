import type { ExecutableIntegrationProviderId } from "@repo/core";

export type MobileProviderActionHandler<TProvider extends string, TContext> = {
  provider: TProvider;
  connect: (context: TContext) => Promise<void>;
  disconnect: (context: TContext) => Promise<void>;
  sync_now: (context: TContext) => Promise<void>;
  refresh_setup_data: (context: TContext) => Promise<void>;
};

export function createMobileProviderActionRegistry<
  TProvider extends string,
  TContext,
  THandler extends MobileProviderActionHandler<TProvider, TContext>,
>(handlers: readonly THandler[]) {
  const byProvider = new Map<TProvider, THandler>(
    handlers.map((handler) => [handler.provider, handler]),
  );
  return {
    get: (provider: TProvider) => byProvider.get(provider) ?? null,
    async dispatch(
      provider: TProvider,
      action: "connect" | "disconnect" | "sync_now" | "refresh_setup_data",
      context: TContext,
    ) {
      const handler = byProvider.get(provider);
      if (!handler) throw new MobileProviderActionUnavailableError(provider);
      await handler[action](context);
    },
  };
}

export class MobileProviderActionUnavailableError extends Error {
  constructor(public readonly provider: string) {
    super("This integration action is unavailable on this device.");
    this.name = MobileProviderActionUnavailableError.name;
  }
}

type ProductionProviderActionContext = {
  connectOAuth: (provider: ExecutableIntegrationProviderId) => Promise<void>;
  disconnectApi: (provider: ExecutableIntegrationProviderId) => Promise<void>;
  syncNow: (provider: ExecutableIntegrationProviderId) => Promise<void>;
  refreshSetupData: (provider: ExecutableIntegrationProviderId) => Promise<void>;
};

export const productionMobileProviderActionRegistry = createMobileProviderActionRegistry<
  ExecutableIntegrationProviderId,
  ProductionProviderActionContext,
  MobileProviderActionHandler<ExecutableIntegrationProviderId, ProductionProviderActionContext>
>([
  {
    provider: "wahoo",
    connect: (context) => context.connectOAuth("wahoo"),
    disconnect: (context) => context.disconnectApi("wahoo"),
    sync_now: (context) => context.syncNow("wahoo"),
    refresh_setup_data: (context) => context.refreshSetupData("wahoo"),
  },
  {
    provider: "strava",
    connect: (context) => context.connectOAuth("strava"),
    disconnect: (context) => context.disconnectApi("strava"),
    sync_now: (context) => context.syncNow("strava"),
    refresh_setup_data: (context) => context.refreshSetupData("strava"),
  },
]);
