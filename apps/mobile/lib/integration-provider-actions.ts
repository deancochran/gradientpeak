import {
  type ExecutableIntegrationProviderId,
  type ProviderCapabilityDefinition,
  type ProviderManifest,
  providerManifestRegistry,
} from "@repo/core";

type MobileConnectionOperationsFor<TManifest extends ProviderManifest> =
  TManifest["connection"] extends { kind: "oauth2" }
    ? { connectOAuth: () => Promise<void> }
    : TManifest["connection"] extends { kind: "device_permissions" }
      ? { requestDevicePermissions: () => Promise<void> }
      : TManifest["connection"] extends { kind: "api_key" }
        ? { submitApiKey: (apiKey: string) => Promise<void> }
        : TManifest["connection"] extends { kind: "file_import" }
          ? { selectImportFile: () => Promise<void> }
          : Record<never, never>;

/** Compile-time binding for mobile connection operations; it does not register executable providers. */
export function bindMobileProviderConnectionOperations<TManifest extends ProviderManifest>(
  manifest: TManifest,
  operations: MobileConnectionOperationsFor<TManifest>,
) {
  return { kind: manifest.connection.kind, provider: manifest.connectorId, operations };
}

export type MobileProviderActionHandler<TProvider extends string, TContext> = {
  provider: TProvider;
  allowedActions?: readonly ("connect" | "disconnect" | "sync_now" | "refresh_setup_data")[];
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
      if (handler.allowedActions && !handler.allowedActions.includes(action)) {
        throw new MobileProviderActionUnavailableError(provider);
      }
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
  requestDevicePermissions?: (provider: string) => Promise<void>;
  connectApiKey?: (provider: string) => Promise<void>;
  selectImportFile?: (provider: string) => Promise<void>;
  disconnectApi: (provider: ExecutableIntegrationProviderId) => Promise<void>;
  syncNow: (provider: ExecutableIntegrationProviderId) => Promise<void>;
  refreshSetupData: (provider: ExecutableIntegrationProviderId) => Promise<void>;
};

function createProductionHandler(
  manifest: (typeof providerManifestRegistry)[number],
): MobileProviderActionHandler<ExecutableIntegrationProviderId, ProductionProviderActionContext> {
  const provider = manifest.connectorId;
  return {
    provider,
    allowedActions: ["connect", ...manifest.actions.map((action) => action.action)],
    connect: (context) => connectProductionMobileProvider(provider, context),
    disconnect: (context) => context.disconnectApi(provider),
    sync_now: (context) => context.syncNow(provider),
    refresh_setup_data: (context) => context.refreshSetupData(provider),
  };
}

export async function connectProductionMobileProvider(
  provider: ExecutableIntegrationProviderId,
  context: Pick<ProductionProviderActionContext, "connectOAuth">,
): Promise<void> {
  const manifest: ProviderCapabilityDefinition | undefined = providerManifestRegistry.find(
    (candidate) => candidate.connectorId === provider,
  );
  if (!manifest) throw new MobileProviderActionUnavailableError(provider);
  await connectMobileProviderFromManifest(manifest, context);
}

export async function connectMobileProviderFromManifest<TManifest extends ProviderManifest>(
  manifest: TManifest,
  context: {
    connectOAuth?: (provider: TManifest["connectorId"]) => Promise<void>;
    requestDevicePermissions?: (provider: TManifest["connectorId"]) => Promise<void>;
    connectApiKey?: (provider: TManifest["connectorId"]) => Promise<void>;
    selectImportFile?: (provider: TManifest["connectorId"]) => Promise<void>;
  },
): Promise<void> {
  const provider = manifest.connectorId;
  switch (manifest.connection.kind) {
    case "oauth2":
      if (!context.connectOAuth) throw new MobileProviderActionUnavailableError(provider);
      await context.connectOAuth(provider);
      return;
    case "device_permissions":
      if (!context.requestDevicePermissions)
        throw new MobileProviderActionUnavailableError(provider);
      await context.requestDevicePermissions(provider);
      return;
    case "api_key":
      if (!context.connectApiKey) throw new MobileProviderActionUnavailableError(provider);
      await context.connectApiKey(provider);
      return;
    case "file_import":
      if (!context.selectImportFile) throw new MobileProviderActionUnavailableError(provider);
      await context.selectImportFile(provider);
      return;
    case "none":
      throw new MobileProviderActionUnavailableError(provider);
  }
}

/** Connector actions are registered from the authoritative Core manifest, not a mobile provider list. */
export const productionMobileProviderActionRegistry = createMobileProviderActionRegistry<
  ExecutableIntegrationProviderId,
  ProductionProviderActionContext,
  MobileProviderActionHandler<ExecutableIntegrationProviderId, ProductionProviderActionContext>
>(providerManifestRegistry.map(createProductionHandler));
