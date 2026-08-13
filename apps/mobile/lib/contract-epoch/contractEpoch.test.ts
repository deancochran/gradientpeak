import { CURRENT_CONTRACT_EPOCH } from "@repo/api/contract-epoch";
import { describe, expect, it, vi } from "vitest";
import {
  CONTRACT_EPOCH_RESET_STORAGE_KEYS,
  createContractEpochInitializer,
} from "./contractEpochReset";

const SECURE_AUTH_KEYS = [
  "gradientpeak.auth.cookie-header",
  "gradientpeak_cookie",
  "gradientpeak_session_data",
  "better-auth_cookie",
  "better-auth_session_data",
] as const;

function dependencies(marker: string | null) {
  const calls: string[] = [];
  const values = new Map<string, string | null>([
    ...SECURE_AUTH_KEYS.map((key) => [key, "old-auth"] as const),
    ["server-url-override", "preserved"],
  ]);
  return {
    calls,
    values,
    dependencies: {
      getMarker: vi.fn(async () => marker),
      setMarker: vi.fn(async (value: string) => {
        calls.push(`marker:${value}`);
      }),
      clearOnboardingRecovery: vi.fn(async () => {
        calls.push("onboarding");
      }),
      clearSecureAuthState: vi.fn(async () => {
        calls.push("auth");
        for (const key of SECURE_AUTH_KEYS) values.set(key, null);
      }),
      clearAppStorage: vi.fn(async (keys: readonly string[]) => {
        calls.push(`storage:${keys.join(",")}`);
      }),
      resetRecordingEvidence: vi.fn(async () => {
        calls.push("sqlite");
      }),
      cleanupStreamFiles: vi.fn(async () => {
        calls.push("streams");
      }),
      cleanupFitFiles: vi.fn(async () => {
        calls.push("fit");
      }),
      cleanupLocation: vi.fn(async () => {
        calls.push("location");
      }),
    },
  };
}

describe("contract epoch initialization", () => {
  it("hard-resets app state in order and writes the marker last", async () => {
    const fixture = dependencies(null);

    await expect(createContractEpochInitializer(fixture.dependencies)()).resolves.toBe("reset");

    expect(fixture.calls).toEqual([
      "onboarding",
      "auth",
      "sqlite",
      `storage:${CONTRACT_EPOCH_RESET_STORAGE_KEYS.join(",")}`,
      "streams",
      "fit",
      "location",
      `marker:${CURRENT_CONTRACT_EPOCH}`,
    ]);
    for (const key of SECURE_AUTH_KEYS) {
      expect(fixture.values.get(key)).toBeNull();
    }
    expect(fixture.values.get("server-url-override")).toBe("preserved");
    expect(CONTRACT_EPOCH_RESET_STORAGE_KEYS).not.toContain("server-url-override");
    expect(CONTRACT_EPOCH_RESET_STORAGE_KEYS).toContain("gradientpeak-plan-display-preferences");
  });

  it("is a no-op when the persisted marker exactly matches", async () => {
    const fixture = dependencies(String(CURRENT_CONTRACT_EPOCH));

    await expect(createContractEpochInitializer(fixture.dependencies)()).resolves.toBe("current");

    expect(fixture.calls).toEqual([]);
    expect(fixture.dependencies.clearSecureAuthState).not.toHaveBeenCalled();
    expect(fixture.dependencies.clearOnboardingRecovery).not.toHaveBeenCalled();
  });

  it("leaves the marker absent on failure so the next attempt retries the full reset", async () => {
    const fixture = dependencies(null);
    fixture.dependencies.cleanupFitFiles.mockRejectedValueOnce(new Error("disk busy"));
    const initialize = createContractEpochInitializer(fixture.dependencies);

    await expect(initialize()).rejects.toThrow("disk busy");
    await expect(initialize()).resolves.toBe("reset");

    expect(fixture.dependencies.resetRecordingEvidence).toHaveBeenCalledTimes(2);
    expect(fixture.dependencies.setMarker).toHaveBeenCalledTimes(1);
  });

  it("does not write the marker when secure auth deletion fails and retries it", async () => {
    const fixture = dependencies(null);
    fixture.dependencies.clearSecureAuthState.mockRejectedValueOnce(
      new Error("secure storage locked"),
    );
    const initialize = createContractEpochInitializer(fixture.dependencies);

    await expect(initialize()).rejects.toThrow("secure storage locked");
    expect(fixture.dependencies.setMarker).not.toHaveBeenCalled();
    await expect(initialize()).resolves.toBe("reset");

    expect(fixture.dependencies.clearSecureAuthState).toHaveBeenCalledTimes(2);
    expect(fixture.dependencies.setMarker).toHaveBeenCalledTimes(1);
  });

  it("does not write the epoch marker when a malformed auth chunk marker fails closed", async () => {
    const fixture = dependencies(null);
    fixture.dependencies.clearSecureAuthState.mockRejectedValueOnce(
      new Error("Invalid Better Auth chunk marker"),
    );

    await expect(createContractEpochInitializer(fixture.dependencies)()).rejects.toThrow(
      "Invalid Better Auth chunk marker",
    );
    expect(fixture.dependencies.setMarker).not.toHaveBeenCalled();
  });

  it("does not write the marker when onboarding recovery deletion fails and retries it", async () => {
    const fixture = dependencies(null);
    fixture.dependencies.clearOnboardingRecovery.mockRejectedValueOnce(
      new Error("secure storage locked"),
    );
    const initialize = createContractEpochInitializer(fixture.dependencies);

    await expect(initialize()).rejects.toThrow("secure storage locked");
    expect(fixture.dependencies.clearSecureAuthState).not.toHaveBeenCalled();
    expect(fixture.dependencies.setMarker).not.toHaveBeenCalled();
    await expect(initialize()).resolves.toBe("reset");
    expect(fixture.dependencies.clearOnboardingRecovery).toHaveBeenCalledTimes(2);
  });
});
