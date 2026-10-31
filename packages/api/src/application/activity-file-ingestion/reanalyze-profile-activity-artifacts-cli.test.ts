import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertRepositoryManagedLocalReanalysisEndpoints,
  parseReanalyzeProfileActivityArtifactsArgs,
  prepareReanalysisEnvironment,
  runReanalyzeProfileActivityArtifactsCli,
} from "../../../scripts/reanalyze-profile-activity-artifacts";

// Environment discovery must not depend on ignored files in a developer checkout.
vi.mock("node:fs", () => ({ existsSync: vi.fn(() => false) }));

afterEach(() => {
  vi.mocked(existsSync).mockReset().mockReturnValue(false);
});

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const localEnvironment = {
  DATABASE_URL: "postgresql://127.0.0.1:54322/postgres",
  NEXT_PRIVATE_SUPABASE_URL: "http://127.0.0.1:54321",
};
const resolveLoopback = vi.fn(async () => [{ address: "127.0.0.1", family: 4 }]);
const confirmedLocalApplyArgs = [
  "--profile-id",
  PROFILE_ID,
  "--apply",
  "--local",
  "--confirm-profile-id",
  PROFILE_ID,
];

describe("reanalyze profile activity artifacts CLI", () => {
  it("loads repository-local env files before client configuration and applies only the fixed DB fallback", () => {
    const env: Record<string, string | undefined> = {};
    const loadedFiles: string[] = [];

    vi.mocked(existsSync).mockImplementation((filePath) =>
      String(filePath).endsWith("apps/web/.env.local"),
    );

    prepareReanalysisEnvironment(env, (filePath) => {
      loadedFiles.push(filePath);
      if (filePath.endsWith("apps/web/.env.local")) {
        env.NEXT_PRIVATE_SUPABASE_URL = "http://127.0.0.1:54321";
        env.NEXT_PRIVATE_SUPABASE_SECRET_KEY = "local-test-key";
      }
    });

    expect(loadedFiles.some((filePath) => filePath.endsWith("apps/web/.env.local"))).toBe(true);
    expect(env.DATABASE_URL).toBe("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
    expect(env.POSTGRES_URL).toBe(env.DATABASE_URL);
    expect(env.NEXT_PRIVATE_SUPABASE_URL).toBe("http://127.0.0.1:54321");
    expect(env.NEXT_PRIVATE_SUPABASE_SECRET_KEY).toBe("local-test-key");
    expect(loadedFiles).toHaveLength(1);
  });

  it("does not load missing env files or fabricate storage credentials", () => {
    const env: Record<string, string | undefined> = {};
    const loadEnvFile = vi.fn();

    prepareReanalysisEnvironment(env, loadEnvFile);

    expect(loadEnvFile).not.toHaveBeenCalled();
    expect(env.DATABASE_URL).toBe("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
    expect(env.POSTGRES_URL).toBe(env.DATABASE_URL);
    expect(env.NEXT_PRIVATE_SUPABASE_URL).toBeUndefined();
    expect(env.NEXT_PRIVATE_SUPABASE_SECRET_KEY).toBeUndefined();
  });

  it("defaults to dry-run and requires exact profile confirmation for apply", () => {
    expect(parseReanalyzeProfileActivityArtifactsArgs(["--profile-id", PROFILE_ID])).toEqual({
      profileId: PROFILE_ID,
      apply: false,
      local: false,
    });
    expect(() =>
      parseReanalyzeProfileActivityArtifactsArgs(["--profile-id", PROFILE_ID, "--apply"]),
    ).toThrow("explicit --local");
    expect(() =>
      parseReanalyzeProfileActivityArtifactsArgs([
        "--profile-id",
        PROFILE_ID,
        "--apply",
        "--local",
        "--confirm-profile-id",
        "22222222-2222-4222-8222-222222222222",
      ]),
    ).toThrow("exactly match");
    expect(
      parseReanalyzeProfileActivityArtifactsArgs([
        "--profile-id",
        PROFILE_ID,
        "--apply",
        "--local",
        "--confirm-profile-id",
        PROFILE_ID,
      ]),
    ).toEqual({ profileId: PROFILE_ID, apply: true, local: true, confirmProfileId: PROFILE_ID });
  });

  it("rejects a non-loopback database endpoint before execution", async () => {
    const execute = vi.fn();
    await expect(
      runReanalyzeProfileActivityArtifactsCli(confirmedLocalApplyArgs, {
        env: {
          ...localEnvironment,
          DATABASE_URL: "postgresql://database.example.test:54322/postgres",
        },
        execute,
        resolveEndpoint: resolveLoopback,
        write: vi.fn(),
      }),
    ).rejects.toThrow("non-loopback database endpoint");
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a non-loopback storage endpoint before execution", async () => {
    const execute = vi.fn();
    await expect(
      runReanalyzeProfileActivityArtifactsCli(confirmedLocalApplyArgs, {
        env: {
          ...localEnvironment,
          NEXT_PRIVATE_SUPABASE_URL: "http://storage.example.test:54321",
        },
        execute,
        resolveEndpoint: resolveLoopback,
        write: vi.fn(),
      }),
    ).rejects.toThrow("non-loopback storage endpoint");
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a configured local name when its actual resolution is not loopback", async () => {
    await expect(
      assertRepositoryManagedLocalReanalysisEndpoints(
        {
          DATABASE_URL: "postgresql://localhost:54322/postgres",
          NEXT_PRIVATE_SUPABASE_URL: "http://localhost:54321",
        },
        vi.fn(async () => [{ address: "192.0.2.20", family: 4 }]),
      ),
    ).rejects.toThrow("resolved database endpoint");
  });

  it("validates local endpoints before an exactly confirmed apply", async () => {
    const execute = vi.fn().mockResolvedValue({
      mode: "apply",
      status: "completed",
      pages: 0,
      artifactsSelected: 0,
      artifactsVerified: 0,
      artifactsAnalyzed: 0,
      generatedEfforts: 0,
      generatedLthrEfforts: 0,
      insertedEfforts: 0,
      insertedLthrEfforts: 0,
      artifactsCalibrated: 0,
      calibration: "not_requested",
      historicalDerivedStateReplay: "not_requested",
    });

    await runReanalyzeProfileActivityArtifactsCli(confirmedLocalApplyArgs, {
      env: localEnvironment,
      execute,
      resolveEndpoint: resolveLoopback,
      write: vi.fn(),
    });

    expect(execute).toHaveBeenCalledWith({
      profileId: PROFILE_ID,
      apply: true,
      confirmProfileId: PROFILE_ID,
    });
  });

  it("prints only aggregate counts and statuses", async () => {
    const write = vi.fn();
    const result = {
      mode: "dry_run" as const,
      status: "completed" as const,
      pages: 1,
      artifactsSelected: 2,
      artifactsVerified: 2,
      artifactsAnalyzed: 2,
      generatedEfforts: 7,
      generatedLthrEfforts: 1,
      insertedEfforts: 0,
      insertedLthrEfforts: 0,
      artifactsCalibrated: 0,
      calibration: "not_requested" as const,
      historicalDerivedStateReplay: "not_requested" as const,
    };

    await runReanalyzeProfileActivityArtifactsCli(["--profile-id", PROFILE_ID], {
      execute: vi.fn().mockResolvedValue(result),
      write,
    });

    const output = String(write.mock.calls[0]?.[0]);
    expect(JSON.parse(output)).toEqual(result);
    expect(output).not.toContain(PROFILE_ID);
    expect(output).not.toMatch(/artifactId|path|digest|name|content/i);
  });
});
