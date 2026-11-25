import { describe, expect, it, vi } from "vitest";
import { resolveStravaAccessToken } from "./credentials";

const now = new Date("2026-09-08T10:00:00Z");
const integration = {
  accessToken: "old-access",
  credentialGeneration: 4,
  expiresAt: "2026-09-08T09:00:00Z",
  externalId: "athlete",
  id: "integration",
  integrationGeneration: 2,
  lifecycleStatus: "active" as const,
  profileId: "profile",
  reconnectRequiredAt: null,
  refreshToken: "old-refresh",
  scope: "activity:read_all",
};
const tokenResponse = {
  token_type: "Bearer" as const,
  access_token: "new-access",
  refresh_token: "new-refresh",
  expires_at: Math.floor(Date.parse("2026-09-08T16:00:00Z") / 1_000),
  expires_in: 21_600,
};

describe("Strava rotating credential refresh", () => {
  it("atomically persists both rotating tokens behind credential and lifecycle generations", async () => {
    const repository = {
      updateIntegrationTokens: vi.fn(async () => 5),
      findIntegrationByProfileId: vi.fn(),
      markReconnectRequired: vi.fn(),
    };
    await expect(
      resolveStravaAccessToken({
        integration,
        now,
        refresh: vi.fn(async () => tokenResponse),
        repository,
      }),
    ).resolves.toBe("new-access");
    expect(repository.updateIntegrationTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "new-access",
        refreshToken: "new-refresh",
        expectedCredentialGeneration: 4,
        expectedIntegrationGeneration: 2,
      }),
    );
  });

  it("loses a refresh CAS safely and rereads the winning credential", async () => {
    const repository = {
      updateIntegrationTokens: vi.fn(async () => null),
      findIntegrationByProfileId: vi.fn(async () => ({
        ...integration,
        accessToken: "winner-access",
        credentialGeneration: 5,
        expiresAt: "2026-09-08T16:00:00Z",
        refreshToken: "winner-refresh",
      })),
      markReconnectRequired: vi.fn(),
    };
    await expect(
      resolveStravaAccessToken({
        integration,
        now,
        refresh: vi.fn(async () => tokenResponse),
        repository,
      }),
    ).resolves.toBe("winner-access");
    expect(repository.markReconnectRequired).not.toHaveBeenCalled();
  });
});
