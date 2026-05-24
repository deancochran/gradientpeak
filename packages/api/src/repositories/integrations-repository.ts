import type {
  IntegrationCredentialInsert,
  IntegrationCredentialRow,
  IntegrationInsert,
  IntegrationRow,
  OAuthStateInsert,
  OAuthStateRow,
  PublicIntegrationProvider,
} from "@repo/db";

type IntegrationUpsertFields = {
  accessToken: IntegrationCredentialInsert["access_token"];
  expiresAt: IntegrationCredentialInsert["expires_at"];
  externalId: IntegrationInsert["external_id"];
  profileId: IntegrationInsert["profile_id"];
  provider: IntegrationInsert["provider"];
  refreshToken: IntegrationCredentialInsert["refresh_token"];
  scope: IntegrationCredentialInsert["scope"];
};
type IntegrationTokenUpdateFields = {
  accessToken: IntegrationCredentialInsert["access_token"];
  expiresAt: IntegrationCredentialInsert["expires_at"];
  profileId: IntegrationInsert["profile_id"];
  provider: IntegrationInsert["provider"];
  refreshToken: IntegrationCredentialInsert["refresh_token"];
};
type OAuthStateCreateFields = {
  createdAt: OAuthStateInsert["created_at"];
  expiresAt: OAuthStateInsert["expires_at"];
  mobileRedirectUri: OAuthStateInsert["mobile_redirect_uri"];
  profileId: OAuthStateInsert["profile_id"];
  provider: OAuthStateInsert["provider"];
  state: OAuthStateInsert["state"];
};

export interface IntegrationsRepository {
  listByProfileId(profileId: string): Promise<IntegrationRow[]>;
  findByProfileIdAndProvider(input: {
    profileId: string;
    provider: PublicIntegrationProvider;
  }): Promise<IntegrationRow | null>;
  findCredentialsByProfileIdAndProvider(input: {
    profileId: string;
    provider: PublicIntegrationProvider;
  }): Promise<IntegrationCredentialRow | null>;
  upsertByProfileIdAndProvider(input: IntegrationUpsertFields): Promise<IntegrationRow>;
  updateTokensByProfileIdAndProvider(input: IntegrationTokenUpdateFields): Promise<void>;
  deleteByProfileIdAndProvider(input: {
    profileId: string;
    provider: PublicIntegrationProvider;
  }): Promise<void>;
}

export interface OAuthStatesRepository {
  create(input: OAuthStateCreateFields): Promise<void>;
  deleteExpired(input: { now: Date; profileId?: string }): Promise<number>;
  deleteCreatedBefore(input: { before: Date; profileId?: string }): Promise<number>;
  findValidByState(input: { state: string; now: Date }): Promise<OAuthStateRow | null>;
  deleteByState(state: string): Promise<void>;
}

export interface IntegrationsRepositories {
  integrations: IntegrationsRepository;
  oauthStates: OAuthStatesRepository;
}
