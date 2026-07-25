import type {
  IntegrationCredentialInsert,
  IntegrationCredentialRow,
  IntegrationInsert,
  IntegrationRow,
  OAuthStateInsert,
  OAuthStateRow,
  PublicIntegrationProvider,
} from "@repo/db";
import type { DrizzleTransactionClient } from "../db";

type IntegrationUpsertFields = {
  accessToken: IntegrationCredentialInsert["access_token"];
  expiresAt: IntegrationCredentialInsert["expires_at"];
  externalId: IntegrationInsert["external_id"];
  profileId: IntegrationInsert["profile_id"];
  provider: IntegrationInsert["provider"];
  refreshToken: IntegrationCredentialInsert["refresh_token"];
  scope: IntegrationCredentialInsert["scope"];
};
export type OAuthIntegrationExpectation =
  | { kind: "absent" }
  | {
      generation: number;
      kind: "present";
      lifecycleStatus: "active" | "disconnected";
    };
type OAuthIntegrationUpsertFields = IntegrationUpsertFields & {
  expectedIntegration: OAuthIntegrationExpectation;
  now: Date;
  state: OAuthStateInsert["state"];
};
type IntegrationTokenUpdateFields = {
  accessToken: IntegrationCredentialInsert["access_token"];
  expiresAt: IntegrationCredentialInsert["expires_at"];
  profileId: IntegrationInsert["profile_id"];
  provider: IntegrationInsert["provider"];
  refreshToken: IntegrationCredentialInsert["refresh_token"];
};
type OAuthStateCreateFields = {
  callbackUri: NonNullable<OAuthStateInsert["callback_uri"]>;
  createdAt: OAuthStateInsert["created_at"];
  expiresAt: OAuthStateInsert["expires_at"];
  mobileRedirectUri: OAuthStateInsert["mobile_redirect_uri"];
  profileId: OAuthStateInsert["profile_id"];
  provider: OAuthStateInsert["provider"];
  requestedScope: NonNullable<OAuthStateInsert["requested_scope"]>;
  state: OAuthStateInsert["state"];
  verifierHash: NonNullable<OAuthStateInsert["verifier_hash"]>;
};

export class IntegrationDisconnectPendingError extends Error {
  constructor() {
    super("Integration disconnect is still pending");
    this.name = "IntegrationDisconnectPendingError";
  }
}

export class IntegrationLifecycleChangedError extends Error {
  constructor() {
    super("Integration lifecycle changed during OAuth");
    this.name = "IntegrationLifecycleChangedError";
  }
}

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
  findGrantByProfileIdAndProvider(input: {
    profileId: string;
    provider: PublicIntegrationProvider;
  }): Promise<Pick<
    IntegrationCredentialRow,
    "expires_at" | "reconnect_required_at" | "scope"
  > | null>;
  upsertByProfileIdAndProvider(input: IntegrationUpsertFields): Promise<IntegrationRow>;
  upsertFromOAuthState(input: OAuthIntegrationUpsertFields): Promise<IntegrationRow | null>;
  upsertFromOAuthStateInTransaction(
    transaction: DrizzleTransactionClient,
    input: OAuthIntegrationUpsertFields,
  ): Promise<IntegrationRow | null>;
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
