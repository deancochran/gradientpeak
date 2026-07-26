import { describe, expect, it, vi } from "vitest";

import { resolveWahooCredentials, WAHOO_RECONNECT_REQUIRED_MESSAGE } from "./credentials";

const freshIntegration = {
  accessToken: "access-1",
  credentialGeneration: 1,
  expiresAt: "2026-04-03T14:00:00.000Z",
  externalId: "77",
  id: "integration-1",
  integrationGeneration: 1,
  profileId: "profile-1",
  refreshToken: "refresh-1",
};

describe("resolveWahooCredentials", () => {
  it("keeps fresh credentials without refreshing or persisting", async () => {
    const refreshAccessToken = vi.fn();
    const persistTokens = vi.fn();

    await expect(
      resolveWahooCredentials({
        integration: freshIntegration,
        now: Date.parse("2026-04-03T12:00:00.000Z"),
        persistTokens,
        refreshAccessToken,
      }),
    ).resolves.toBe(freshIntegration);
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(persistTokens).not.toHaveBeenCalled();
  });

  it("refreshes near-expiry credentials and persists token rotation", async () => {
    const persistTokens = vi.fn().mockResolvedValue(2);
    const refreshAccessToken = vi.fn().mockResolvedValue({
      accessToken: "access-2",
      expiresAt: "2026-04-03T14:00:00.000Z",
      refreshToken: "refresh-2",
    });

    await expect(
      resolveWahooCredentials({
        integration: {
          ...freshIntegration,
          expiresAt: "2026-04-03T12:00:30.000Z",
        },
        now: Date.parse("2026-04-03T12:00:00.000Z"),
        persistTokens,
        refreshAccessToken,
      }),
    ).resolves.toMatchObject({
      accessToken: "access-2",
      credentialGeneration: 2,
      refreshToken: "refresh-2",
    });
    expect(refreshAccessToken).toHaveBeenCalledWith("refresh-1");
    expect(persistTokens).toHaveBeenCalledWith({
      accessToken: "access-2",
      expiresAt: "2026-04-03T14:00:00.000Z",
      credentialGeneration: 1,
      integrationGeneration: 1,
      id: "integration-1",
      reconnectRequiredAt: null,
      refreshToken: "refresh-2",
    });
  });

  it("requires reconnect when expiring credentials have no refresh token", async () => {
    await expect(
      resolveWahooCredentials({
        integration: {
          ...freshIntegration,
          expiresAt: "2026-04-03T11:00:00.000Z",
          refreshToken: null,
        },
        now: Date.parse("2026-04-03T12:00:00.000Z"),
        persistTokens: vi.fn().mockResolvedValue(2),
        refreshAccessToken: vi.fn(),
      }),
    ).rejects.toMatchObject({
      code: "WAHOO_RECONNECT_REQUIRED",
      message: WAHOO_RECONNECT_REQUIRED_MESSAGE,
    });
  });

  it.each([
    Object.assign(new Error("provider rejected refresh"), {
      code: "invalid_grant",
      status: 400,
    }),
    Object.assign(new Error("unauthorized"), { status: 401 }),
  ])("normalizes definitive refresh failures to reconnect-required", async (error) => {
    await expect(
      resolveWahooCredentials({
        integration: {
          ...freshIntegration,
          expiresAt: "2026-04-03T11:00:00.000Z",
        },
        now: Date.parse("2026-04-03T12:00:00.000Z"),
        persistTokens: vi.fn().mockResolvedValue(2),
        refreshAccessToken: vi.fn().mockRejectedValue(error),
      }),
    ).rejects.toMatchObject({
      code: "WAHOO_RECONNECT_REQUIRED",
      message: WAHOO_RECONNECT_REQUIRED_MESSAGE,
    });
  });

  it.each([429, 503])("leaves HTTP %s refresh failures retryable", async (status) => {
    const error = Object.assign(new Error("temporary Wahoo failure"), {
      status,
    });
    await expect(
      resolveWahooCredentials({
        integration: {
          ...freshIntegration,
          expiresAt: "2026-04-03T11:00:00.000Z",
        },
        now: Date.parse("2026-04-03T12:00:00.000Z"),
        persistTokens: vi.fn().mockResolvedValue(2),
        refreshAccessToken: vi.fn().mockRejectedValue(error),
      }),
    ).rejects.toBe(error);
  });

  it("shares one in-process refresh across concurrent job families", async () => {
    const persistTokens = vi.fn().mockResolvedValue(undefined);
    const refreshAccessToken = vi.fn().mockResolvedValue({
      accessToken: "rotated-access",
      expiresAt: "2026-04-03T13:00:00.000Z",
      refreshToken: "rotated-refresh",
    });
    const input = {
      integration: {
        ...freshIntegration,
        expiresAt: "2026-04-03T11:00:00.000Z",
      },
      now: Date.parse("2026-04-03T12:00:00.000Z"),
      persistTokens,
      refreshAccessToken,
    };

    const [historyCredentials, plannedCredentials] = await Promise.all([
      resolveWahooCredentials(input),
      resolveWahooCredentials(input),
    ]);

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(persistTokens).toHaveBeenCalledTimes(1);
    expect(historyCredentials.accessToken).toBe("rotated-access");
    expect(plannedCredentials.accessToken).toBe("rotated-access");
  });

  it("uses a winning token after a refresh CAS loss without overwriting its rotated refresh token", async () => {
    const winner = {
      ...freshIntegration,
      accessToken: "winner-access",
      expiresAt: "2026-04-03T14:00:00.000Z",
      credentialGeneration: 2,
      reconnectRequiredAt: null,
      refreshToken: "winner-refresh",
    };
    const persistTokens = vi.fn().mockResolvedValue(null);
    const refreshAccessToken = vi.fn().mockResolvedValue({
      accessToken: "loser-access",
      expiresAt: "2026-04-03T14:00:00.000Z",
      refreshToken: "loser-refresh",
    });

    await expect(
      resolveWahooCredentials({
        integration: {
          ...freshIntegration,
          expiresAt: "2026-04-03T11:00:00.000Z",
          credentialGeneration: 1,
        },
        now: Date.parse("2026-04-03T12:00:00.000Z"),
        persistTokens,
        readCurrentCredentials: vi.fn().mockResolvedValue(winner),
        refreshAccessToken,
      }),
    ).resolves.toMatchObject({ accessToken: "winner-access", refreshToken: "winner-refresh" });
    expect(persistTokens).toHaveBeenCalledWith(
      expect.objectContaining({ credentialGeneration: 1, refreshToken: "loser-refresh" }),
    );
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  });
});
