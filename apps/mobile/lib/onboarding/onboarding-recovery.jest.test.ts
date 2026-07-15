import * as SecureStore from "expo-secure-store";
import {
  clearOnboardingRecovery,
  createCompletedOnboardingRecovery,
  hasPendingOnboardingRecovery,
  loadOnboardingRecovery,
  ONBOARDING_RECOVERY_MAX_BYTES,
  ONBOARDING_RECOVERY_VERSION,
  OnboardingRecoveryPayloadTooLargeError,
  onboardingRecoveryExpiry,
  type PendingOnboardingRecoveryRecord,
  saveOnboardingRecovery,
} from "./onboarding-recovery";

const USER_ID = "user-1";
const FOLLOW_ID = "22222222-2222-4222-8222-222222222222";
const STORAGE_KEY = `onboarding-recovery:v${ONBOARDING_RECOVERY_VERSION}:${USER_ID}`;
const secureStoreMock = SecureStore as typeof SecureStore & { __store: Map<string, string> };

function recoveryRecord(
  overrides: Partial<PendingOnboardingRecoveryRecord> = {},
): PendingOnboardingRecoveryRecord {
  return {
    version: ONBOARDING_RECOVERY_VERSION,
    userId: USER_ID,
    status: "pending",
    expiresAt: onboardingRecoveryExpiry(),
    profileRetry: { experienceLevel: "skip", intents: ["follow_people"] },
    social: {
      invitationIds: [],
      groupIds: [],
      followProfileIds: [FOLLOW_ID],
      statuses: { [`follow:${FOLLOW_ID}`]: "failed" },
    },
    lifecycle: {
      required: { status: "saved", retryable: false },
      goal: { status: "skipped", retryable: false },
      settings: { status: "skipped", retryable: false },
    },
    ...overrides,
  };
}

describe("onboarding recovery secure storage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    secureStoreMock.__store.clear();
  });

  it("uses SecureStore and persists only the minimal same-user recovery payload", async () => {
    const record = recoveryRecord();
    await saveOnboardingRecovery(record);

    await expect(loadOnboardingRecovery(USER_ID)).resolves.toEqual(record);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(STORAGE_KEY, expect.any(String));
    const raw = secureStoreMock.__store.get(STORAGE_KEY) ?? "";
    for (const forbidden of [
      "dob",
      "gender",
      "weight_kg",
      "max_hr",
      "resting_hr",
      "ftp",
      "threshold_pace",
      "css",
      "training_settings",
      "provider",
      "token",
      "error",
    ]) {
      expect(raw).not.toContain(forbidden);
    }
    expect(hasPendingOnboardingRecovery(record)).toBe(true);
  });

  it.each([
    ["corrupt", "not-json"],
    ["version-mismatched", JSON.stringify({ ...recoveryRecord(), version: 999 })],
    ["other-user", JSON.stringify({ ...recoveryRecord(), userId: "user-2" })],
    ["expired", JSON.stringify({ ...recoveryRecord(), expiresAt: Date.now() - 1 })],
    [
      "deep-malformed social id",
      JSON.stringify({
        ...recoveryRecord(),
        social: {
          invitationIds: [],
          groupIds: [],
          followProfileIds: ["not-a-uuid"],
          statuses: { "follow:not-a-uuid": "failed" },
        },
      }),
    ],
    [
      "deep-malformed status relationship",
      JSON.stringify({
        ...recoveryRecord(),
        social: { ...recoveryRecord().social, statuses: { "follow:other": "failed" } },
      }),
    ],
    [
      "deep-malformed settings patch",
      JSON.stringify({
        ...recoveryRecord(),
        settingsPatch: { minSessionsPerWeek: 12, maxSessionsPerWeek: 2 },
        lifecycle: {
          required: { status: "saved", retryable: false },
          goal: { status: "skipped", retryable: false },
          settings: { status: "pending", retryable: true },
        },
      }),
    ],
    [
      "deep-malformed profile retry",
      JSON.stringify({
        ...recoveryRecord(),
        profileRetry: { experienceLevel: "elite", intents: [] },
      }),
    ],
  ])("rejects and clears %s state", async (_label, raw) => {
    secureStoreMock.__store.set(STORAGE_KEY, raw);

    await expect(loadOnboardingRecovery(USER_ID)).resolves.toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(STORAGE_KEY);
    expect(secureStoreMock.__store.has(STORAGE_KEY)).toBe(false);
  });

  it("rejects malformed canonical goal content on save", async () => {
    const malformed = {
      ...recoveryRecord(),
      goal: {
        target_date: "tomorrow",
        title: "Race",
        priority: 5,
        activity_category: "run",
        target_payload: { type: "completion" },
      },
      lifecycle: {
        required: { status: "saved", retryable: false },
        goal: { status: "pending", retryable: true },
        settings: { status: "skipped", retryable: false },
      },
    } as PendingOnboardingRecoveryRecord;

    await expect(saveOnboardingRecovery(malformed)).rejects.toThrow();
  });

  it("replaces pending data with a minimal completion marker before cleanup", async () => {
    await saveOnboardingRecovery(recoveryRecord());
    const marker = createCompletedOnboardingRecovery(USER_ID);
    await saveOnboardingRecovery(marker);

    expect(JSON.parse(secureStoreMock.__store.get(STORAGE_KEY) ?? "{}")).toEqual(marker);
    expect(Object.keys(marker).sort()).toEqual(["expiresAt", "status", "userId", "version"]);
    expect(hasPendingOnboardingRecovery(marker)).toBe(false);
  });

  it("removes the user-scoped key when recovery is discarded", async () => {
    await saveOnboardingRecovery(recoveryRecord());

    await clearOnboardingRecovery(USER_ID);

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(STORAGE_KEY);
    expect(secureStoreMock.__store.has(STORAGE_KEY)).toBe(false);
  });

  it("rejects an oversized UTF-8 payload before writing to SecureStore", async () => {
    const oversized = recoveryRecord({ userId: "🚴".repeat(ONBOARDING_RECOVERY_MAX_BYTES) });
    jest.mocked(SecureStore.setItemAsync).mockClear();

    await expect(saveOnboardingRecovery(oversized)).rejects.toBeInstanceOf(
      OnboardingRecoveryPayloadTooLargeError,
    );
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("rejects more than eight unresolved selections in any social category", async () => {
    const followProfileIds = Array.from(
      { length: 9 },
      (_, index) => `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    );

    await expect(
      saveOnboardingRecovery(
        recoveryRecord({
          social: {
            invitationIds: [],
            groupIds: [],
            followProfileIds,
            statuses: Object.fromEntries(
              followProfileIds.map((id) => [`follow:${id}`, "pending" as const]),
            ),
          },
        }),
      ),
    ).rejects.toThrow();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("keeps a completed marker non-pending when deletion fails so cleanup can retry", async () => {
    const completed = createCompletedOnboardingRecovery(USER_ID);
    await saveOnboardingRecovery(completed);
    jest
      .mocked(SecureStore.deleteItemAsync)
      .mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(clearOnboardingRecovery(USER_ID)).rejects.toThrow("storage unavailable");
    await expect(loadOnboardingRecovery(USER_ID)).resolves.toEqual(completed);
    expect(hasPendingOnboardingRecovery(completed)).toBe(false);
  });
});
