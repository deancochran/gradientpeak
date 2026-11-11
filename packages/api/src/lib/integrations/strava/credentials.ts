import type { StravaIntegrationRecord, StravaRepository } from "../../../repositories";
import {
  refreshStravaAccessToken,
  StravaOAuthError,
  type StravaRefreshTokenResponse,
} from "./oauth";

const REFRESH_SKEW_MS = 60_000;

export class StravaAuthorizationRequiredError extends Error {
  constructor() {
    super("Strava authorization must be renewed");
    this.name = StravaAuthorizationRequiredError.name;
  }
}

function accessTokenIsFresh(integration: StravaIntegrationRecord, now: Date): boolean {
  return Boolean(
    integration.expiresAt &&
      Date.parse(integration.expiresAt) > now.getTime() + REFRESH_SKEW_MS &&
      !integration.reconnectRequiredAt,
  );
}

async function readConcurrentWinner(input: {
  expectedCredentialGeneration: number;
  now: Date;
  profileId: string;
  repository: Pick<StravaRepository, "findIntegrationByProfileId">;
}): Promise<string | null> {
  const current = await input.repository.findIntegrationByProfileId(input.profileId);
  return current &&
    current.credentialGeneration !== input.expectedCredentialGeneration &&
    accessTokenIsFresh(current, input.now)
    ? current.accessToken
    : null;
}

/**
 * Rotating credentials are replaced in one generation-guarded update. A stale refresher never
 * overwrites a winner and always rereads after CAS loss or a concurrent invalid-grant response.
 */
export async function resolveStravaAccessToken(input: {
  integration: StravaIntegrationRecord;
  now?: Date;
  refresh?: (refreshToken: string) => Promise<StravaRefreshTokenResponse>;
  repository: Pick<
    StravaRepository,
    "findIntegrationByProfileId" | "markReconnectRequired" | "updateIntegrationTokens"
  >;
}): Promise<string> {
  const now = input.now ?? new Date();
  if (accessTokenIsFresh(input.integration, now)) return input.integration.accessToken;
  if (!input.integration.refreshToken || input.integration.reconnectRequiredAt) {
    throw new StravaAuthorizationRequiredError();
  }

  let refreshed: StravaRefreshTokenResponse;
  try {
    refreshed = await (input.refresh ?? refreshStravaAccessToken)(input.integration.refreshToken);
  } catch (error) {
    const winner = await readConcurrentWinner({
      expectedCredentialGeneration: input.integration.credentialGeneration,
      now,
      profileId: input.integration.profileId,
      repository: input.repository,
    });
    if (winner) return winner;
    if (error instanceof StravaOAuthError && error.reason === "invalid_grant") {
      await input.repository.markReconnectRequired({
        expectedCredentialGeneration: input.integration.credentialGeneration,
        expectedIntegrationGeneration: input.integration.integrationGeneration,
        id: input.integration.id,
      });
      throw new StravaAuthorizationRequiredError();
    }
    throw error;
  }

  if (refreshed.expires_at * 1_000 <= now.getTime()) {
    throw new StravaOAuthError("invalid_token_response");
  }

  const generation = await input.repository.updateIntegrationTokens({
    accessToken: refreshed.access_token,
    expectedCredentialGeneration: input.integration.credentialGeneration,
    expectedIntegrationGeneration: input.integration.integrationGeneration,
    expiresAt: new Date(refreshed.expires_at * 1_000).toISOString(),
    id: input.integration.id,
    refreshToken: refreshed.refresh_token,
  });
  if (generation !== null) return refreshed.access_token;

  const winner = await readConcurrentWinner({
    expectedCredentialGeneration: input.integration.credentialGeneration,
    now,
    profileId: input.integration.profileId,
    repository: input.repository,
  });
  if (winner) return winner;
  throw new StravaAuthorizationRequiredError();
}
