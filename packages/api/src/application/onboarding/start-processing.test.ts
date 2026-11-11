import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dispatchInitialOnboardingWork: vi.fn(),
  hasPendingOnboardingOAuthState: vi.fn(),
  listExecutableOnboardingProviders: vi.fn(),
  lockOnboardingProfile: vi.fn(),
  lockProfileAdvisoryFence: vi.fn(),
  readOnboardingReadinessSnapshot: vi.fn(),
  requireProviderOnboardingRuntime: vi.fn(),
  setOnboardingStatus: vi.fn(),
}));

vi.mock("../../repositories/onboarding-lifecycle-repository", () => ({
  hasPendingOnboardingOAuthState: mocks.hasPendingOnboardingOAuthState,
  listExecutableOnboardingProviders: mocks.listExecutableOnboardingProviders,
  lockOnboardingProfile: mocks.lockOnboardingProfile,
  OnboardingPendingOAuthError: class OnboardingPendingOAuthError extends Error {},
  OnboardingStatusConflictError: class OnboardingStatusConflictError extends Error {},
  readOnboardingReadinessSnapshot: mocks.readOnboardingReadinessSnapshot,
  setOnboardingStatus: mocks.setOnboardingStatus,
}));
vi.mock("../../repositories/profile-advisory-fence", () => ({
  lockProfileAdvisoryFence: mocks.lockProfileAdvisoryFence,
}));
vi.mock("../integrations/provider-runtime-registry", () => ({
  requireProviderOnboardingRuntime: mocks.requireProviderOnboardingRuntime,
}));
vi.mock("./provider-dispatch", () => ({
  dispatchInitialOnboardingWork: mocks.dispatchInitialOnboardingWork,
}));

import { startOnboardingProcessing } from "./start-processing";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";

function testDb() {
  const transaction = { kind: "transaction" };
  const db = {
    transaction: vi.fn((operation: (value: typeof transaction) => Promise<unknown>) =>
      operation(transaction),
    ),
  } as never;
  return { db, transaction };
}

describe("startOnboardingProcessing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lockOnboardingProfile.mockResolvedValue({ onboarding_status: "provider_selection" });
    mocks.hasPendingOnboardingOAuthState.mockResolvedValue(false);
    mocks.setOnboardingStatus.mockResolvedValue(undefined);
    mocks.dispatchInitialOnboardingWork.mockResolvedValue(undefined);
  });

  it("selects each provider's onboarding runtime before starting processing", async () => {
    const { db, transaction } = testDb();
    const onboardingRuntime = { enqueueInitialOnboardingWork: vi.fn() };
    mocks.listExecutableOnboardingProviders.mockResolvedValue([
      {
        generation: 3,
        id: "integration-id",
        provider: "wahoo",
        scope: "workouts_read offline_data user_read",
      },
    ]);
    mocks.requireProviderOnboardingRuntime.mockReturnValue(onboardingRuntime);

    await expect(startOnboardingProcessing({ db, profileId: PROFILE_ID })).resolves.toEqual({
      providers: ["wahoo"],
      status: "processing",
    });
    const dispatchInput = mocks.dispatchInitialOnboardingWork.mock.calls[0]?.[0];
    expect(dispatchInput.runtimes.get("wahoo")).toBe(onboardingRuntime);
    expect(dispatchInput).toMatchObject({ db, profileId: PROFILE_ID, transaction });
    expect(mocks.setOnboardingStatus).toHaveBeenCalledWith(transaction, PROFILE_ID, "processing");
  });

  it("moves directly to review when no providers are selected", async () => {
    const { db, transaction } = testDb();
    mocks.listExecutableOnboardingProviders.mockResolvedValue([]);

    await expect(startOnboardingProcessing({ db, profileId: PROFILE_ID })).resolves.toEqual({
      providers: [],
      status: "review",
    });
    expect(mocks.requireProviderOnboardingRuntime).not.toHaveBeenCalled();
    expect(mocks.setOnboardingStatus).toHaveBeenCalledWith(transaction, PROFILE_ID, "review");
  });
});
