import { type IntegrationProviderId, providerCapabilityRegistry } from "@repo/core";

export const integrationProviders = providerCapabilityRegistry.map((provider) => provider.id);

export type IntegrationProvider = IntegrationProviderId;
