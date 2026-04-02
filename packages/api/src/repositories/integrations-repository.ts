import type {
  IntegrationRow,
  OAuthStateRow,
  PublicIntegrationProvider,
  PublicIntegrationsRow,
} from "@repo/db";

export interface IntegrationsRepository {
  listByProfileId(profileId: string): Promise<PublicIntegrationsRow[]>;
  findByProfileIdAndProvider(input: {
    profileId: string;
    provider: PublicIntegrationProvider;
  }): Promise<IntegrationRow | null>;
  upsertByProfileIdAndProvider(input: {
    profileId: string;
    provider: PublicIntegrationProvider;
    externalId: string;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
    scope: string | null;
  }): Promise<void>;
  updateTokensByProfileIdAndProvider(input: {
    profileId: string;
    provider: PublicIntegrationProvider;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
  }): Promise<void>;
  deleteByProfileIdAndProvider(input: {
    profileId: string;
    provider: PublicIntegrationProvider;
  }): Promise<void>;
}

export interface OAuthStatesRepository {
  create(input: {
    state: string;
    profileId: string;
    provider: PublicIntegrationProvider;
    mobileRedirectUri: string;
    createdAt: Date;
    expiresAt: Date;
  }): Promise<void>;
  deleteExpired(input: { now: Date; profileId?: string }): Promise<number>;
  deleteCreatedBefore(input: { before: Date; profileId?: string }): Promise<number>;
  findValidByState(input: { state: string; now: Date }): Promise<OAuthStateRow | null>;
  deleteByState(state: string): Promise<void>;
}

export interface IntegrationsRepositories {
  integrations: IntegrationsRepository;
  oauthStates: OAuthStatesRepository;
}
