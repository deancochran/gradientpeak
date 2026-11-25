import { describe, expect, it, vi } from "vitest";
import {
  createPendingOAuthStateWithFence,
  IntegrationOnboardingClosedError,
  integrationManagementIsClosed,
  withOpenIntegrationManagementTransaction,
} from "./onboarding-integration-gate";

describe("onboarding integration gate", () => {
  it.each([
    ["provider_selection", false],
    ["processing", true],
    ["review", true],
    ["completed", false],
  ] as const)("maps %s to closed=%s", (status, closed) => {
    expect(integrationManagementIsClosed(status)).toBe(closed);
  });
});

describe("createPendingOAuthStateWithFence", () => {
  it("does not create OAuth state when startProcessing won the profile fence", async () => {
    const insert = vi.fn();
    const tx = {
      execute: vi.fn(),
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: () => ({
              for: async () => [{ id: "profile", onboarding_status: "processing" }],
            }),
          }),
        }),
      })),
      insert,
    };
    const db = {
      transaction: (operation: (value: typeof tx) => Promise<unknown>) => operation(tx),
    };

    await expect(
      createPendingOAuthStateWithFence({
        db: db as never,
        profileId: "11111111-1111-4111-8111-111111111111",
        provider: "wahoo",
        state: "22222222-2222-4222-8222-222222222222",
        callbackUri: "https://app.example/callback",
        requestedScope: "user_read",
        verifierHash: "hash",
        mobileRedirectUri: "gradientpeak://integrations",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toBeInstanceOf(IntegrationOnboardingClosedError);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("withOpenIntegrationManagementTransaction", () => {
  it("does not run the effect when the locked profile is processing", async () => {
    const effect = vi.fn();
    const tx = {
      execute: vi.fn(),
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: () => ({
              for: async () => [{ id: "profile", onboarding_status: "processing" }],
            }),
          }),
        }),
      })),
    };
    const db = {
      transaction: (operation: (value: typeof tx) => Promise<unknown>) => operation(tx),
    };

    await expect(
      withOpenIntegrationManagementTransaction({
        db: db as never,
        profileId: "11111111-1111-4111-8111-111111111111",
        operation: effect,
      }),
    ).rejects.toBeInstanceOf(IntegrationOnboardingClosedError);
    expect(effect).not.toHaveBeenCalled();
  });
});
