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
  const finalizationRecovery = new Map<string, { status: "pending" | "blocked"; reason: string }>();
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
      if (sql.includes("recording_finalization_recovery r")) {
        const profileId = params[0] as string;
        return [...sessions.entries()]
          .filter(
            ([sessionId, session]) =>
              session.profile_id === profileId &&
              (session.finalized_path || finalizationRecovery.has(sessionId)),
          )
          .flatMap(([session_id, session]) => {
            const recovery = finalizationRecovery.get(session_id);
            return session.finalized_path || recovery
              ? [
                  {
                    session_id,
                    ...session,
                    recovery_status: recovery?.status ?? null,
                    recovery_reason: recovery?.reason ?? null,
                  },
                ]
              : [];
          }) as T[];
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
      } else if (sql.includes("INTO recording_finalization_recovery")) {
        const dynamicStatus = sql.includes("VALUES (?, ?, ?, ?)");
        finalizationRecovery.set(params[0] as string, {
          status: dynamicStatus ? (params[1] as "pending" | "blocked") : "pending",
          reason: params[dynamicStatus ? 2 : 1] as string,
        });
      }
      return { changes: 1 };
    }),
  };
  return { db, rows, sessions, finalizationRecovery };
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

  it("migrates v0 and every prior version stepwise, rolls back an interrupted step, and fails closed for future versions", async () => {
    function migrationDatabase(initialVersion: number, failVersion?: number) {
      let version = initialVersion;
      const columns = new Set(
        initialVersion >= 2 ? ["finalized_artifact_json", "finalized_artifact_digest"] : [],
      );
      const statements: string[] = [];
      let fail = failVersion;
      const db: RecordingEvidenceSqlExecutor = {
        async getAllAsync<T>(sql: string): Promise<T[]> {
          statements.push(sql);
          if (sql === "PRAGMA user_version") return [{ user_version: version }] as T[];
          if (sql.startsWith("PRAGMA table_info"))
            return [...columns].map((name) => ({ name })) as T[];
          return [] as T[];
        },
        async execAsync(sql: string): Promise<void> {
          statements.push(sql);
          if (sql.includes("ADD COLUMN finalized_artifact_json"))
            columns.add("finalized_artifact_json");
          if (sql.includes("ADD COLUMN finalized_artifact_digest"))
            columns.add("finalized_artifact_digest");
          const target = /PRAGMA user_version = (\d+)/.exec(sql)?.[1];
          if (target && Number(target) === fail)
            throw new Error("interrupted-before-version-commit");
          if (target) version = Number(target);
        },
        async runAsync() {
          return { changes: 1 };
        },
        async withExclusiveTransactionAsync(task) {
          const snapshot = {
            version,
            columns: new Set(columns),
            statementCount: statements.length,
          };
          try {
            await task(db);
          } catch (error) {
            version = snapshot.version;
            columns.clear();
            for (const column of snapshot.columns) columns.add(column);
            statements.splice(snapshot.statementCount);
            throw error;
          }
        },
      };
      return {
        db,
        statements,
        version: () => version,
        resume: () => {
          fail = undefined;
        },
      };
    }

    for (const prior of [0, 1, 2, 3]) {
      const fake = migrationDatabase(prior);
      await initializeRecordingEvidenceDatabase(fake.db);
      expect(fake.version()).toBe(5);
      expect(fake.statements[0]).toBe("PRAGMA user_version");
      if (prior < 2)
        expect(fake.statements.slice(1).some((sql) => sql.includes("CREATE TABLE"))).toBe(true);
      if (prior === 3) {
        // The old v3 definition does not advertise accepted; v4 must rebuild
        // rather than attempting SQLite's unsupported CHECK alteration.
        expect(fake.statements.some((sql) => sql.includes("recording_evidence_sessions_v4"))).toBe(
          true,
        );
      }
    }
    const interrupted = migrationDatabase(3, 4);
    await expect(initializeRecordingEvidenceDatabase(interrupted.db)).rejects.toThrow(
      "interrupted-before-version-commit",
    );
    expect(interrupted.version()).toBe(3);
    interrupted.resume();
    await initializeRecordingEvidenceDatabase(interrupted.db);
    expect(interrupted.version()).toBe(5);
    const future = migrationDatabase(6);
    await expect(initializeRecordingEvidenceDatabase(future.db)).rejects.toThrow(
      "unsupported-recording-evidence-schema",
    );
    expect(future.statements).toEqual(["PRAGMA user_version", "PRAGMA foreign_keys = ON"]);
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

  it("quarantines only a corrupt derived FIT reference and retains rebuild evidence", async () => {
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
      { status: "rebuild-pending", sessionId: "profile:a", reason: "finalized-artifact-mismatch" },
    ]);

    expect(memory.sessions.get("profile:a")?.state).toBe("fenced");
    expect(memory.sessions.get("profile:a")?.finalized_path).toBeNull();
    expect(files.get("file:///artifact.fit")?.deleted).toBe(true);
    expect(memory.finalizationRecovery.get("profile:a")).toMatchObject({ status: "pending" });
  });

  it("does not strand a legacy finalized file without a handoff", async () => {
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
        status: "rebuild-pending",
        sessionId: "legacy",
        reason: "legacy-finalized-handoff-missing",
      },
    ]);
    expect(memory.sessions.get("legacy")?.state).toBe("fenced");
    expect(memory.finalizationRecovery.get("legacy")).toMatchObject({ status: "pending" });
    // Retry observes the durable pending row instead of attempting to submit it.
    await expect(inspectFinalizedArtifactReferences("profile")).resolves.toEqual([
      {
        status: "rebuild-pending",
        sessionId: "legacy",
        reason: "legacy-finalized-handoff-missing",
      },
    ]);
  });

  it("blocks a validated legacy finalized file when no recovery manifest exists", async () => {
    const memory = memoryDatabase();
    setRecordingEvidenceDatabaseForTests(memory.db);
    files.set("file:///legacy.fit", { size: 3, bytes: Uint8Array.from([1, 2, 3]) });
    memory.sessions.set("legacy", {
      profile_id: "profile",
      state: "finalized",
      next_sequence: 0,
      finalized_path: "file:///legacy.fit",
      finalized_size: 3,
      finalized_sha256: "06".repeat(32),
    });
    await expect(inspectFinalizedArtifactReferences("profile")).resolves.toEqual([
      {
        status: "blocked",
        sessionId: "legacy",
        reason: "legacy-finalized-recovery-manifest-missing",
      },
    ]);
    expect(memory.finalizationRecovery.get("legacy")).toMatchObject({ status: "blocked" });
  });
});
