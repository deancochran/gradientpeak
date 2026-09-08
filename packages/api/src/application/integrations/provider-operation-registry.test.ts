import { describe, expect, it, vi } from "vitest";
import { dispatchInitialOnboardingWork } from "../onboarding/provider-dispatch";
import {
  createProviderOperationRegistry,
  type ProviderOperationAdapter,
} from "./provider-operation-registry";
import { getProviderOperationAdapter } from "./provider-operation-runtime";

type FakeProvider = "alpha" | "beta";

function fakeAdapter(provider: FakeProvider): ProviderOperationAdapter<FakeProvider> {
  return {
    provider,
    isConfigured: () => true,
    isOAuthConfigured: () => true,
    createOAuthAuthorization: vi.fn(() => ({
      binding: {
        callbackUri: `https://example.test/${provider}`,
        requestedScope: "history profile",
        verifierHash: "hash",
      },
      url: `https://example.test/oauth/${provider}`,
    })),
    validateOAuthStateBinding: vi.fn(() => true),
    exchangeOAuthCode: vi.fn(async () => ({
      access_token: "access-token",
      refresh_token: "refresh-token",
    })),
    resolveOAuthIdentity: vi.fn(async () => ({
      externalId: `${provider}-external-id`,
      requiresActivation: false,
    })),
    activateOAuthCredential: vi.fn(async () => undefined),
    classifyOAuthFailure: vi.fn(() => ({
      kind: "exchange" as const,
      code: "token_exchange_failed",
      message: "Connection failed",
    })),
    readSetupEvidence: vi.fn(async () => ({
      profile: { dob: null, gender: null, onboarding_status: "provider_selection" as const },
      sources: {},
      values: {},
    })),
    readOverviewEvidence: vi.fn(async () => ({
      activityHistory: {
        lastError: null,
        lastFailedAt: null,
        lastSucceededAt: null,
        queuedJobId: null,
        status: "idle" as const,
        importRun: null,
      },
      plannedActivities: {
        lastError: null,
        lastFailedAt: null,
        lastSucceededAt: null,
        queuedJobId: null,
        status: "unsupported" as const,
      },
      setupData: {
        lastError: null,
        lastFailedAt: null,
        lastSucceededAt: null,
        status: "idle" as const,
      },
    })),
    syncNow: vi.fn(async () => ({ queued: true })),
    refreshSetupEvidence: vi.fn(async () => ({ provider, status: "queued" })),
    disconnect: vi.fn(async () => undefined),
    enqueueConnectedProfileWork: vi.fn(async () => undefined),
    enqueueInitialOnboardingWork: vi.fn(async () => ({
      historyJobId: `${provider}-history`,
      profileJobId: `${provider}-profile`,
    })),
    admitOnboardingRetry: vi.fn(() => ({
      historyJobType: `${provider}.history`,
      profileJobType: `${provider}.profile`,
    })),
    onboardingWork: {
      historyJobType: `${provider}.history`,
      profileJobType: `${provider}.profile`,
    },
    identifyOnboardingWork: vi.fn(
      ({
        jobs,
      }: Parameters<ProviderOperationAdapter<FakeProvider>["identifyOnboardingWork"]>[0]) => ({
        historyJobId: jobs.find((job) => job.jobType === `${provider}.history`)?.id ?? null,
        profileJobId: jobs.find((job) => job.jobType === `${provider}.profile`)?.id ?? null,
        requiredJobTypes: [`${provider}.history`, `${provider}.profile`],
        importRunLinked: jobs.some(
          (job) =>
            job.jobType === `${provider}.history` &&
            job.importRunId !== null &&
            job.importRunId === job.payloadImportRunId,
        ),
      }),
    ),
    allowsAction: vi.fn(() => true),
  };
}

describe("provider operation registry", () => {
  it("registers Strava through the same provider operation seam", () => {
    expect(getProviderOperationAdapter("strava")).toMatchObject({ provider: "strava" });
  });

  it("dispatches initial onboarding work through every provider adapter", async () => {
    const alpha = fakeAdapter("alpha");
    const beta = fakeAdapter("beta");
    await dispatchInitialOnboardingWork({
      adapters: new Map<
        FakeProvider,
        Pick<ProviderOperationAdapter<FakeProvider>, "enqueueInitialOnboardingWork">
      >([
        ["alpha", alpha],
        ["beta", beta],
      ]),
      db: {} as never,
      profileId: "profile-1",
      providers: (["alpha", "beta"] as const).map((provider) => ({
        active: true,
        generation: 1,
        id: `${provider}-integration`,
        provider,
        scope: null,
        importRun: null,
        jobs: [],
      })) as never,
      transaction: {} as never,
    });

    expect(alpha.enqueueInitialOnboardingWork).toHaveBeenCalledOnce();
    expect(beta.enqueueInitialOnboardingWork).toHaveBeenCalledOnce();
  });

  it("fails closed when an adapter is absent or runtime-disabled", () => {
    const disabled = { ...fakeAdapter("alpha"), isConfigured: () => false };
    const registry = createProviderOperationRegistry<
      FakeProvider,
      ProviderOperationAdapter<FakeProvider>
    >([disabled]);
    expect(registry.get("beta")).toBeNull();
    expect(() => registry.require("alpha")).toThrow(/not executable/i);
  });

  it("accepts normalized overview evidence from a synthetic adapter", async () => {
    const adapter = fakeAdapter("beta");
    const registry = createProviderOperationRegistry<
      FakeProvider,
      ProviderOperationAdapter<FakeProvider>
    >([adapter]);

    await expect(
      registry.require("beta").readOverviewEvidence({
        db: {} as never,
        profileId: "profile-1",
        integration: null,
        scope: null,
      }),
    ).resolves.toMatchObject({
      activityHistory: { status: "idle" },
      plannedActivities: { status: "unsupported" },
      setupData: { status: "idle" },
    });
  });
});
