import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-sqlite", () => ({ openDatabaseAsync: vi.fn() }));
const files = new Map<string, { size: number; bytes: Uint8Array; deleted?: boolean }>();
vi.mock("expo-file-system", () => ({
  File: class {
    private readonly value: { size: number; bytes: Uint8Array; deleted?: boolean } | undefined;
    constructor(path: string) {
      this.value = files.get(path);
    }
    get exists() {
      return Boolean(this.value && !this.value.deleted);
    }
    get size() {
      return this.value?.size ?? 0;
    }
    async bytes() {
      return this.value?.bytes ?? new Uint8Array();
    }
    delete() {
      if (this.value) this.value.deleted = true;
    }
  },
}));
vi.mock("../fit/GarminFitEncoder", () => ({
  validateFinalizedFitFile: vi.fn(async () => ({ byteSize: 3 })),
}));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "sha256" },
  digest: vi.fn(async (_algorithm: string, value: Uint8Array) => {
    const total = [...value].reduce((sum, byte) => sum + byte, 0);
    return Uint8Array.from(Array.from({ length: 32 }, () => total % 256)).buffer;
  }),
  digestStringAsync: vi.fn(async (_algorithm: string, value: string) =>
    [...value]
      .reduce((sum, char) => sum + char.charCodeAt(0), 0)
      .toString(16)
      .padStart(64, "0"),
  ),
}));

import {
  allocateRecordingEvidenceSession,
  appendHeadlessGpsLocations,
  createRecordingStreamJournalAdapter,
  fenceRecordingEvidenceSession,
  initializeRecordingEvidenceDatabase,
  inspectFinalizedArtifactReferences,
  RecordingEvidenceClosedError,
  type RecordingEvidenceSqlExecutor,
  resetRecordingEvidenceJournalForTests,
  setRecordingEvidenceDatabaseForTests,
} from "./recordingEvidenceJournal";

type Session = {
  profile_id: string;
  state: string;
  next_sequence: number;
  next_stream_order?: number;
  finalized_path?: string | null;
  finalized_size?: number | null;
  finalized_sha256?: string | null;
  finalized_artifact_json?: string | null;
  finalized_artifact_digest?: string | null;
  checkpoint_json?: string | null;
  checkpoint_digest?: string | null;
};

function memoryDatabase() {
  const sessions = new Map<string, Session>();
  const rows: Array<{
    sessionId: string;
    sequence: number;
    marker: string;
    streamKind?: string;
    order?: number;
    timestamp?: number;
    payload?: string;
    byte_size?: number;
    sha256?: string;
    version?: number;
  }> = [];
  type MemoryDatabase = {
    execAsync: (source: string) => Promise<void>;
    withExclusiveTransactionAsync: (
      task: (transaction: MemoryDatabase) => Promise<void>,
    ) => Promise<void>;
    getAllAsync: <T>(sql: string, ...params: unknown[]) => Promise<T[]>;
    runAsync: (sql: string, ...params: unknown[]) => Promise<{ changes: number }>;
  };
  const db: MemoryDatabase = {
    execAsync: vi.fn(async () => undefined),
    withExclusiveTransactionAsync: async (task) => task(db),
    getAllAsync: async <T>(sql: string, ...params: unknown[]): Promise<T[]> => {
      if (sql.includes("FROM recording_evidence_sessions s")) {
        const profileId = params[0] as string;
        return [...sessions.entries()]
          .filter(
            ([, session]) => session.profile_id === profileId && session.state === "finalized",
          )
          .map(([session_id, session]) => ({ session_id, ...session })) as T[];
      }
      if (sql.includes("FROM recording_stream_envelopes")) {
        const sessionId = params[0] as string;
        const kind = params[1] as string | undefined;
        if (sql.includes("MAX(stream_order)")) {
          const matching = rows.filter((row) => row.sessionId === sessionId);
          return [
            { next_order: matching.length, timestamp: matching.at(-1)?.timestamp ?? null },
          ] as T[];
        }
        if (sql.includes("MAX(sequence)")) {
          const matching = rows.filter(
            (row) => row.sessionId === sessionId && row.streamKind === kind,
          );
          return [{ next_sequence: matching.length }] as T[];
        }
        return rows
          .filter((row) => row.sessionId === sessionId && (!kind || row.streamKind === kind))
          .sort((left, right) =>
            sql.includes("ORDER BY stream_order")
              ? (left.order ?? 0) - (right.order ?? 0)
              : (left.streamKind ?? "").localeCompare(right.streamKind ?? "") ||
                left.sequence - right.sequence,
          )
          .map((row) => ({
            streamKind: row.streamKind,
            sequence: row.sequence,
            streamOrder: row.order,
            timestamp: row.timestamp,
            payload: row.payload,
            byte_size: row.byte_size,
            sha256: row.sha256,
            commit_marker: row.marker,
            version: row.version,
          })) as T[];
      }
      if (sql.includes("WHERE session_id")) {
        const session = sessions.get(params[0] as string);
        return (session ? [session] : []) as T[];
      }
      if (sql.includes("WHERE state = 'active'")) {
        return [...sessions.entries()]
          .filter(([, session]) => session.state === "active")
          .map(([session_id, session]) => ({
            session_id,
            next_sequence: session.next_sequence,
          })) as T[];
      }
      return [] as T[];
    },
    runAsync: vi.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.startsWith("INSERT INTO recording_evidence_sessions")) {
        sessions.set(params[0] as string, {
          profile_id: params[1] as string,
          state: "active",
          next_sequence: 0,
          next_stream_order: 0,
        });
      } else if (sql.startsWith("INSERT INTO recording_gps")) {
        rows.push({
          sessionId: params[0] as string,
          sequence: params[1] as number,
          marker: params[6] as string,
        });
      } else if (sql.startsWith("INSERT INTO recording_stream_envelopes")) {
        rows.push({
          sessionId: params[0] as string,
          streamKind: params[1] as string,
          sequence: params[2] as number,
          order: params[3] as number,
          timestamp: params[4] as number,
          payload: params[5] as string,
          byte_size: params[6] as number,
          sha256: params[7] as string,
          marker: params[8] as string,
          version: params[9] as number,
        });
      } else if (sql.includes("SET next_sequence")) {
        const session = sessions.get(params[1] as string);
        if (session) session.next_sequence = params[0] as number;
      } else if (sql.includes("SET next_stream_order")) {
        const session = sessions.get(params[1] as string);
        if (session) session.next_stream_order = params[0] as number;
      } else if (sql.includes("SET state = 'fenced', finalized_path = NULL")) {
        const session = sessions.get(params[0] as string);
        if (session?.state === "finalized") {
          session.state = "fenced";
          session.finalized_path = null;
          session.finalized_size = null;
          session.finalized_sha256 = null;
        }
      } else if (sql.includes("SET state = 'fenced'")) {
        const session = sessions.get(params[0] as string);
        if (session && (session.state === "active" || session.state === "finalized"))
          session.state = "fenced";
      } else if (sql.includes("SET state = 'quarantined'")) {
        const session = sessions.get(params[0] as string);
        if (session?.state === "finalized") session.state = "quarantined";
      }
      return { changes: 1 };
    }),
  };
  return { db, rows, sessions };
}

const location = {
  timestamp: 1_000,
  coords: { latitude: 40, longitude: -75, accuracy: 5, altitude: null, speed: null },
} as never;

describe("recording evidence journal", () => {
  beforeEach(() => {
    resetRecordingEvidenceJournalForTests();
    files.clear();
  });

  it("creates only a fresh current schema, retries an interrupted create, and rejects old or new versions without mutation", async () => {
    function schemaDatabase(initialVersion: number, failCreate = false) {
      let version = initialVersion;
      const statements: string[] = [];
      let fail = failCreate;
      const db: RecordingEvidenceSqlExecutor = {
        async getAllAsync<T>(sql: string): Promise<T[]> {
          statements.push(sql);
          if (sql === "PRAGMA user_version") return [{ user_version: version }] as T[];
          return [] as T[];
        },
        async execAsync(sql: string): Promise<void> {
          statements.push(sql);
          if (fail && sql.includes("CREATE TABLE recording_evidence_sessions")) {
            fail = false;
            throw new Error("interrupted-before-version-commit");
          }
          const target = /PRAGMA user_version = (\d+)/.exec(sql)?.[1];
          if (target) version = Number(target);
        },
        async runAsync() {
          return { changes: 1 };
        },
        async withExclusiveTransactionAsync(task) {
          const snapshot = {
            version,
            statementCount: statements.length,
          };
          try {
            await task(db);
          } catch (error) {
            version = snapshot.version;
            statements.splice(snapshot.statementCount);
            throw error;
          }
        },
      };
      return {
        db,
        statements,
        version: () => version,
      };
    }

    const fresh = schemaDatabase(0);
    await initializeRecordingEvidenceDatabase(fresh.db);
    expect(fresh.version()).toBe(5);
    expect(fresh.statements).toEqual([
      "PRAGMA user_version",
      expect.stringContaining("CREATE TABLE recording_evidence_sessions"),
      "PRAGMA user_version = 5",
      "PRAGMA foreign_keys = ON",
    ]);

    const interrupted = schemaDatabase(0, true);
    await expect(initializeRecordingEvidenceDatabase(interrupted.db)).rejects.toThrow(
      "interrupted-before-version-commit",
    );
    expect(interrupted.version()).toBe(0);
    await initializeRecordingEvidenceDatabase(interrupted.db);
    expect(interrupted.version()).toBe(5);

    const current = schemaDatabase(5);
    await initializeRecordingEvidenceDatabase(current.db);
    expect(current.statements).toEqual(["PRAGMA user_version", "PRAGMA foreign_keys = ON"]);
    for (const unsupportedVersion of [1, 6]) {
      const unsupported = schemaDatabase(unsupportedVersion);
      await expect(initializeRecordingEvidenceDatabase(unsupported.db)).rejects.toThrow(
        "unsupported-recording-evidence-schema",
      );
      expect(unsupported.statements).toEqual(["PRAGMA user_version"]);
    }
  });

  it("writes headless GPS without a provider and rejects ambiguous sessions", async () => {
    const memory = memoryDatabase();
    setRecordingEvidenceDatabaseForTests(memory.db);
    await allocateRecordingEvidenceSession({ sessionId: "profile:a", profileId: "profile" });
    await expect(appendHeadlessGpsLocations([location])).resolves.toBe(1);
    expect(memory.rows).toEqual([{ sessionId: "profile:a", sequence: 0, marker: "committed-v1" }]);
    memory.sessions.set("profile:b", { profile_id: "profile", state: "active", next_sequence: 0 });
    await expect(appendHeadlessGpsLocations([location])).rejects.toThrow("ambiguous");
  });

  it("commits every valid headless location in bounded chunks", async () => {
    const memory = memoryDatabase();
    setRecordingEvidenceDatabaseForTests(memory.db);
    await allocateRecordingEvidenceSession({ sessionId: "profile:a", profileId: "profile" });
    const batch = Array.from({ length: 201 }, (_, index) => ({
      timestamp: index + 1,
      coords: { latitude: 40, longitude: -75, accuracy: 5, altitude: null, speed: null },
    })) as never;
    await expect(appendHeadlessGpsLocations(batch)).resolves.toBe(201);
    expect(memory.rows.filter((row) => row.sessionId === "profile:a")).toHaveLength(201);
    expect(memory.sessions.get("profile:a")?.next_sequence).toBe(201);
  });

  it("rejects a cross-profile session claim and post-fence writes", async () => {
    const memory = memoryDatabase();
    setRecordingEvidenceDatabaseForTests(memory.db);
    await allocateRecordingEvidenceSession({ sessionId: "profile:a", profileId: "profile" });
    await expect(
      allocateRecordingEvidenceSession({ sessionId: "profile:a", profileId: "other" }),
    ).rejects.toThrow("owner");
    await fenceRecordingEvidenceSession("profile:a");
    await expect(appendHeadlessGpsLocations([location])).rejects.toBeInstanceOf(
      RecordingEvidenceClosedError,
    );
  });

  it("rebuilds committed stream rows and quarantines only the corrupt session", async () => {
    const memory = memoryDatabase();
    setRecordingEvidenceDatabaseForTests(memory.db);
    await allocateRecordingEvidenceSession({ sessionId: "profile:a", profileId: "profile" });
    await allocateRecordingEvidenceSession({ sessionId: "profile:b", profileId: "other" });
    const a = createRecordingStreamJournalAdapter({ sessionId: "profile:a", profileId: "profile" });
    const b = createRecordingStreamJournalAdapter({ sessionId: "profile:b", profileId: "other" });
    await a.append([{ streamKind: "power", timestamp: 1, payload: '{"value":1}' }]);
    await b.append([{ streamKind: "power", timestamp: 1, payload: '{"value":2}' }]);
    expect(await a.recover()).toHaveLength(1);
    const corrupt = memory.rows.find(
      (row) => row.sessionId === "profile:a" && row.streamKind === "power",
    );
    if (!corrupt) throw new Error("test setup failed");
    corrupt.byte_size = 0;
    await expect(a.recover()).rejects.toThrow("stream-order-or-marker-invalid");
    await expect(b.recover()).resolves.toHaveLength(1);
  });

  it("rejects digest, order, owner, and uncommitted stream rows", async () => {
    const memory = memoryDatabase();
    setRecordingEvidenceDatabaseForTests(memory.db);
    await allocateRecordingEvidenceSession({ sessionId: "profile:a", profileId: "profile" });
    const adapter = createRecordingStreamJournalAdapter({
      sessionId: "profile:a",
      profileId: "profile",
    });
    await adapter.append([{ streamKind: "power", timestamp: 1, payload: '{"value":1}' }]);
    const row = memory.rows.find((item) => item.streamKind === "power");
    if (!row) throw new Error("test setup failed");
    row.sha256 = "0".repeat(64);
    await expect(adapter.recover()).rejects.toThrow("stream-digest-invalid");
    await expect(
      createRecordingStreamJournalAdapter({ sessionId: "profile:a", profileId: "other" }).recover(),
    ).rejects.toThrow("profile-session-mismatch");
  });

  it("allocates one contiguous global order across stream kinds and batches", async () => {
    const memory = memoryDatabase();
    setRecordingEvidenceDatabaseForTests(memory.db);
    await allocateRecordingEvidenceSession({ sessionId: "profile:a", profileId: "profile" });
    const adapter = createRecordingStreamJournalAdapter({
      sessionId: "profile:a",
      profileId: "profile",
    });
    await adapter.append([
      { streamKind: "power", timestamp: 1, payload: '{"value":1}' },
      { streamKind: "cadence", timestamp: 2, payload: '{"value":2}' },
    ]);
    await adapter.append([{ streamKind: "altitude", timestamp: 3, payload: '{"value":3}' }]);
    expect((await adapter.recover()).map((row) => row.order)).toEqual([0, 1, 2]);
  });

  it("quarantines incomplete finalized rows instead of creating recovery state", async () => {
    const memory = memoryDatabase();
    setRecordingEvidenceDatabaseForTests(memory.db);
    files.set("file:///artifact.fit", { size: 3, bytes: Uint8Array.from([1, 2, 3]) });
    memory.sessions.set("profile:a", {
      profile_id: "profile",
      state: "finalized",
      next_sequence: 0,
      finalized_path: "file:///artifact.fit",
      finalized_size: 3,
      finalized_sha256: "0".repeat(64),
    });

    await expect(inspectFinalizedArtifactReferences("profile")).resolves.toEqual([
      { status: "quarantined", sessionId: "profile:a", reason: "finalized-current-fields-missing" },
    ]);

    expect(memory.sessions.get("profile:a")?.state).toBe("quarantined");
  });

  it("does not replay an old finalized row even when its file and checkpoint are valid", async () => {
    const memory = memoryDatabase();
    setRecordingEvidenceDatabaseForTests(memory.db);
    const payload = "{}";
    const digest = [...payload]
      .reduce((sum, char) => sum + char.charCodeAt(0), 0)
      .toString(16)
      .padStart(64, "0");
    files.set("file:///legacy.fit", { size: 3, bytes: Uint8Array.from([1, 2, 3]) });
    memory.sessions.set("legacy", {
      profile_id: "profile",
      state: "finalized",
      next_sequence: 0,
      finalized_path: "file:///legacy.fit",
      finalized_size: 3,
      finalized_sha256: "06".repeat(32),
      checkpoint_json: payload,
      checkpoint_digest: digest,
    });

    await expect(inspectFinalizedArtifactReferences("profile")).resolves.toEqual([
      {
        status: "quarantined",
        sessionId: "legacy",
        reason: "finalized-current-fields-missing",
      },
    ]);
    expect(memory.sessions.get("legacy")?.state).toBe("quarantined");
    await expect(inspectFinalizedArtifactReferences("profile")).resolves.toEqual([]);
  });

  it("keeps a complete current finalized handoff recoverable for idempotent startup replay", async () => {
    const memory = memoryDatabase();
    setRecordingEvidenceDatabaseForTests(memory.db);
    const artifact = {
      schemaVersion: 2,
      sessionId: "current",
      profileId: "profile",
      snapshot: {
        identity: {
          sessionId: "current",
          revision: 1,
          startedAt: "2026-03-20T10:00:00Z",
          appBuild: "1.2.3",
        },
        activity: {
          activity_category: "bike",
          mode: "planned",
          gpsMode: "on",
          eventId: "550e8400-e29b-41d4-a716-446655440000",
          activityPlanId: "550e8400-e29b-41d4-a716-446655440001",
          routeId: "550e8400-e29b-41d4-a716-446655440002",
        },
        profileSnapshot: { ftp: 250, thresholdHr: 170, weightKg: 72, defaultsApplied: [] },
        devices: { connected: [], controllableTrainer: null, selectedSources: [] },
        capabilities: {
          canTrackLocation: true,
          canTrackPower: true,
          canTrackHeartRate: true,
          canTrackCadence: true,
          shouldShowMap: true,
          shouldShowSteps: true,
          shouldShowRouteOverlay: true,
          shouldShowTurnByTurn: true,
          shouldShowFollowAlong: false,
          shouldShowTrainerControl: true,
          canAutoAdvanceSteps: true,
          shouldAutoFollowTargets: true,
          autoFollowPriority: "plan_targets",
          autoFollowConflict: false,
          autoFollowConflictReason: null,
          primaryMetric: "power",
          isValid: true,
          errors: [],
          warnings: [],
        },
        policies: {
          sourcePolicy: {
            preferUserSelection: true,
            allowDerivedSpeed: true,
            allowDerivedDistance: true,
          },
          controlPolicy: { trainerMode: "auto", autoAdvanceSteps: true },
          degradedModePolicy: {
            allowWithoutGps: true,
            allowWithoutSensors: true,
            exposeSourceWarnings: true,
          },
        },
      },
      overrides: [],
      finalStats: { durationSeconds: 60, movingSeconds: 55, distanceMeters: 200 },
      activityFilePath: "file:///current.fit",
      streamArtifactPaths: [],
      executionManifest: {
        version: 1,
        compilerVersion: 1,
        planHash: "0".repeat(64),
        occurrences: [],
      },
      runtimeSourceState: {
        selectedSources: [],
        currentMetrics: {},
        degradedState: { isDegraded: false, metrics: [] },
        sourceChanges: [],
      },
      completedAt: "2026-03-20T10:01:00Z",
    };
    const handoff = JSON.stringify(artifact);
    const handoffDigest = [...handoff]
      .reduce((sum, char) => sum + char.charCodeAt(0), 0)
      .toString(16)
      .padStart(64, "0");
    files.set("file:///current.fit", { size: 3, bytes: Uint8Array.from([1, 2, 3]) });
    memory.sessions.set("current", {
      profile_id: "profile",
      state: "finalized",
      next_sequence: 0,
      finalized_path: "file:///current.fit",
      finalized_size: 3,
      finalized_sha256: "06".repeat(32),
      finalized_artifact_json: handoff,
      finalized_artifact_digest: handoffDigest,
    });
    await expect(inspectFinalizedArtifactReferences("profile")).resolves.toEqual([
      { status: "healthy", sessionId: "current" },
    ]);
    await expect(inspectFinalizedArtifactReferences("profile")).resolves.toEqual([
      { status: "healthy", sessionId: "current" },
    ]);
  });
});
