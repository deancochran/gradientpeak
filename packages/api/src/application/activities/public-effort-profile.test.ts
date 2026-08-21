import { beforeEach, describe, expect, it, vi } from "vitest";

const parser = vi.hoisted(() => ({ parseActivityFile: vi.fn() }));

vi.mock("@repo/core/server/activity-files", () => ({
  parseActivityFile: parser.parseActivityFile,
}));

import {
  createPublicActivityEffortProfileCache,
  derivePublicActivityEffortProfile,
  getPublicActivityEffortProfile,
  PUBLIC_ACTIVITY_EFFORT_PROFILE_MAX_FILE_BYTES,
  PUBLIC_ACTIVITY_EFFORT_PROFILE_MAX_RECORDS,
  PUBLIC_ACTIVITY_EFFORT_PROFILE_MAX_SEGMENTS,
  publicActivityEffortProfileResponseSchema,
} from "./public-effort-profile";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const VIEWER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_VIEWER_ID = "33333333-3333-4333-8333-333333333333";
const ACTIVITY_ID = "44444444-4444-4444-8444-444444444444";
const ARTIFACT_ID = "55555555-5555-4555-8555-555555555555";
const startedAt = new Date("2026-08-18T08:00:00.000Z");
const segment = {
  activityCategory: "bike" as const,
  startOffsetMs: 0,
  endOffsetMs: 120_000,
  sourceSessionIndex: null,
};

const records = [
  { timestamp: new Date(startedAt.getTime()), power: 100, heartRate: 140 },
  { timestamp: new Date(startedAt.getTime() + 60_000), power: 500, heartRate: 170 },
  { timestamp: new Date(startedAt.getTime() + 120_000), power: 900, heartRate: 190 },
];

type DbFixture = {
  acceptedFollower?: boolean;
  artifact?: {
    id: string;
    bucket: string;
    path: string;
    format: string;
    byteSize: number;
  } | null;
  ownerId?: string;
  segments?: unknown[];
  visibility?: "private" | "followers" | "public";
};

function queryResult(value: unknown[]) {
  const builder: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "where", "orderBy"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.limit = vi.fn(async () => value);
  return builder;
}

function createDb(fixture: DbFixture = {}) {
  const artifact =
    fixture.artifact === undefined
      ? {
          id: ARTIFACT_ID,
          bucket: "activity-files",
          path: "artifacts/activity.fit",
          format: "fit",
          byteSize: 3,
        }
      : fixture.artifact;
  const segments = fixture.segments ?? [segment];
  const select = vi.fn((shape: Record<string, unknown>) => {
    if (Object.hasOwn(shape, "contentVisibility")) {
      return queryResult([
        {
          id: ACTIVITY_ID,
          profileId: fixture.ownerId ?? OWNER_ID,
          contentVisibility: fixture.visibility ?? "public",
          startedAt,
          segmentsRevision: 3,
        },
      ]);
    }
    if (Object.hasOwn(shape, "byteSize")) return queryResult(artifact ? [artifact] : []);
    if (Object.hasOwn(shape, "activityCategory")) return queryResult(segments);
    throw new Error("Unexpected profile test query");
  });
  const execute = vi.fn(async () => ({ rows: fixture.acceptedFollower ? [{}] : [] }));
  return { db: { select, execute } as never, execute, select };
}

function createStorage(data = new Uint8Array([1, 2, 3])) {
  const readObjectBounded = vi.fn(async () => ({ data, contentType: "application/octet-stream" }));
  return {
    readObjectBounded,
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async () => ({ error: null })),
        remove: vi.fn(async () => ({ error: null })),
      })),
    },
  };
}

beforeEach(() => {
  parser.parseActivityFile.mockReset();
  parser.parseActivityFile.mockReturnValue({ records });
});

describe("public completed-activity effort projection", () => {
  it("returns only threshold-free ordinal levels and elapsed positions", () => {
    const profile = derivePublicActivityEffortProfile({
      activityStartedAt: startedAt,
      records,
      segments: [segment],
    });

    expect(publicActivityEffortProfileResponseSchema.parse(profile)).toEqual({
      basis: "activity_wide_signal_ordinal",
      samples: [
        { elapsedSeconds: 0, effortLevel: "lowest" },
        { elapsedSeconds: 60, effortLevel: "higher" },
        { elapsedSeconds: 120, effortLevel: "highest" },
      ],
    });
    expect(Object.keys(profile ?? {}).sort()).toEqual(["basis", "samples"]);
    expect(Object.keys(profile?.samples[0] ?? {}).sort()).toEqual([
      "effortLevel",
      "elapsedSeconds",
    ]);
    expect(JSON.stringify(profile)).not.toMatch(
      /threshold|target|raw|stream|provenance|power|watts|pace|heart.?rate|normalized|intensity|diagnostic/i,
    );
    expect(
      publicActivityEffortProfileResponseSchema.safeParse({
        ...profile,
        thresholdWatts: 300,
      }).success,
    ).toBe(false);
    for (const sample of profile?.samples ?? []) {
      expect(Object.entries(sample).filter(([, value]) => typeof value === "number")).toEqual([
        ["elapsedSeconds", sample.elapsedSeconds],
      ]);
    }
  });

  it("returns no profile without a usable stream and rejects unordered records", () => {
    const earlierRecord = records[0];
    const laterRecord = records[1];
    if (!earlierRecord || !laterRecord) throw new Error("Missing record fixture");
    expect(
      derivePublicActivityEffortProfile({
        activityStartedAt: startedAt,
        records: records.map(({ timestamp }) => ({ timestamp })),
        segments: [segment],
      }),
    ).toBeNull();
    expect(
      derivePublicActivityEffortProfile({
        activityStartedAt: startedAt,
        records: [laterRecord, earlierRecord],
        segments: [segment],
      }),
    ).toBeNull();
  });

  it("omits a multi-segment profile when only unrelated segment signals are available", () => {
    const segments = [
      {
        activityCategory: "bike" as const,
        startOffsetMs: 0,
        endOffsetMs: 120_000,
        sourceSessionIndex: 0,
      },
      {
        activityCategory: "run" as const,
        startOffsetMs: 120_000,
        endOffsetMs: 240_000,
        sourceSessionIndex: 1,
      },
    ];

    expect(
      derivePublicActivityEffortProfile({
        activityStartedAt: startedAt,
        segments,
        records: [
          { timestamp: new Date(startedAt.getTime()), sessionMessageIndex: 0, power: 100 },
          {
            timestamp: new Date(startedAt.getTime() + 60_000),
            sessionMessageIndex: 0,
            power: 200,
          },
          {
            timestamp: new Date(startedAt.getTime() + 120_000),
            sessionMessageIndex: 1,
            speed: 2,
          },
          {
            timestamp: new Date(startedAt.getTime() + 180_000),
            sessionMessageIndex: 1,
            speed: 4,
          },
        ],
      }),
    ).toBeNull();
  });

  it("does not compare speed across different activity categories", () => {
    expect(
      derivePublicActivityEffortProfile({
        activityStartedAt: startedAt,
        segments: [
          {
            activityCategory: "run",
            startOffsetMs: 0,
            endOffsetMs: 120_000,
            sourceSessionIndex: 0,
          },
          {
            activityCategory: "swim",
            startOffsetMs: 120_000,
            endOffsetMs: 240_000,
            sourceSessionIndex: 1,
          },
        ],
        records: [
          { timestamp: new Date(startedAt.getTime()), sessionMessageIndex: 0, speed: 2 },
          {
            timestamp: new Date(startedAt.getTime() + 60_000),
            sessionMessageIndex: 0,
            speed: 4,
          },
          {
            timestamp: new Date(startedAt.getTime() + 120_000),
            sessionMessageIndex: 1,
            speed: 1,
          },
          {
            timestamp: new Date(startedAt.getTime() + 180_000),
            sessionMessageIndex: 1,
            speed: 2,
          },
        ],
      }),
    ).toBeNull();
  });

  it("uses one activity-wide scale when every segment shares a recorded signal", () => {
    const profile = derivePublicActivityEffortProfile({
      activityStartedAt: startedAt,
      segments: [
        {
          activityCategory: "bike",
          startOffsetMs: 0,
          endOffsetMs: 120_000,
          sourceSessionIndex: 0,
        },
        {
          activityCategory: "run",
          startOffsetMs: 120_000,
          endOffsetMs: 240_000,
          sourceSessionIndex: 1,
        },
      ],
      records: [
        {
          timestamp: new Date(startedAt.getTime()),
          sessionMessageIndex: 0,
          power: 100,
          heartRate: 100,
        },
        {
          timestamp: new Date(startedAt.getTime() + 60_000),
          sessionMessageIndex: 0,
          power: 900,
          heartRate: 140,
        },
        {
          timestamp: new Date(startedAt.getTime() + 120_000),
          sessionMessageIndex: 1,
          speed: 2,
          heartRate: 160,
        },
        {
          timestamp: new Date(startedAt.getTime() + 180_000),
          sessionMessageIndex: 1,
          speed: 20,
          heartRate: 200,
        },
      ],
    });

    expect(profile).toEqual({
      basis: "activity_wide_signal_ordinal",
      samples: [
        { elapsedSeconds: 0, effortLevel: "lowest" },
        { elapsedSeconds: 60, effortLevel: "lower" },
        { elapsedSeconds: 120, effortLevel: "higher" },
        { elapsedSeconds: 180, effortLevel: "highest" },
      ],
    });
  });
});

describe("public completed-activity effort authorization and bounds", () => {
  it.each([
    ["owner", OWNER_ID, "private" as const, false],
    ["public viewer", VIEWER_ID, "public" as const, false],
    ["accepted follower", VIEWER_ID, "followers" as const, true],
  ])("serves an authorized %s", async (_label, viewerId, visibility, acceptedFollower) => {
    const { db } = createDb({ visibility, acceptedFollower });
    const storage = createStorage();

    await expect(
      getPublicActivityEffortProfile({
        activityId: ACTIVITY_ID,
        viewerId,
        db,
        artifactStorage: storage,
        cache: createPublicActivityEffortProfileCache(),
      }),
    ).resolves.toMatchObject({ basis: "activity_wide_signal_ordinal" });
    expect(storage.readObjectBounded).toHaveBeenCalledWith({
      bucket: "activity-files",
      path: "artifacts/activity.fit",
      maxBytes: PUBLIC_ACTIVITY_EFFORT_PROFILE_MAX_FILE_BYTES,
    });
    expect(parser.parseActivityFile).toHaveBeenCalledWith(
      expect.objectContaining({
        limits: { maxRecords: PUBLIC_ACTIVITY_EFFORT_PROFILE_MAX_RECORDS },
      }),
    );
  });

  it("re-checks follower access before a cache hit and fails closed after revocation", async () => {
    const fixture: DbFixture = { visibility: "followers", acceptedFollower: true };
    const { db, execute } = createDb(fixture);
    const storage = createStorage();
    const cache = createPublicActivityEffortProfileCache();
    const read = () =>
      getPublicActivityEffortProfile({
        activityId: ACTIVITY_ID,
        viewerId: VIEWER_ID,
        db,
        artifactStorage: storage,
        cache,
      });

    await expect(read()).resolves.toMatchObject({ basis: "activity_wide_signal_ordinal" });
    fixture.acceptedFollower = false;
    await expect(read()).resolves.toBeNull();

    expect(execute).toHaveBeenCalledTimes(2);
    expect(storage.readObjectBounded).toHaveBeenCalledTimes(1);
  });

  it("does not read or cache artifacts for a viewer without access", async () => {
    const { db } = createDb({ visibility: "private" });
    const storage = createStorage();

    await expect(
      getPublicActivityEffortProfile({
        activityId: ACTIVITY_ID,
        viewerId: VIEWER_ID,
        db,
        artifactStorage: storage,
        cache: createPublicActivityEffortProfileCache(),
      }),
    ).resolves.toBeNull();
    expect(storage.readObjectBounded).not.toHaveBeenCalled();
  });

  it("reuses only a viewer-partitioned safe result", async () => {
    const { db } = createDb({ visibility: "public" });
    const storage = createStorage();
    const cache = createPublicActivityEffortProfileCache();
    const read = (viewerId: string) =>
      getPublicActivityEffortProfile({
        activityId: ACTIVITY_ID,
        viewerId,
        db,
        artifactStorage: storage,
        cache,
      });

    await expect(read(VIEWER_ID)).resolves.toMatchObject({
      basis: "activity_wide_signal_ordinal",
    });
    await expect(read(VIEWER_ID)).resolves.toMatchObject({
      basis: "activity_wide_signal_ordinal",
    });
    await expect(read(OTHER_VIEWER_ID)).resolves.toMatchObject({
      basis: "activity_wide_signal_ordinal",
    });

    expect(storage.readObjectBounded).toHaveBeenCalledTimes(2);
  });

  it("rejects oversized files and segment sets before download", async () => {
    const oversizedFile = createDb({
      artifact: {
        id: ARTIFACT_ID,
        bucket: "activity-files",
        path: "artifacts/large.fit",
        format: "fit",
        byteSize: PUBLIC_ACTIVITY_EFFORT_PROFILE_MAX_FILE_BYTES + 1,
      },
    });
    const oversizedSegments = createDb({
      segments: Array.from(
        { length: PUBLIC_ACTIVITY_EFFORT_PROFILE_MAX_SEGMENTS + 1 },
        (_, index) => ({
          ...segment,
          startOffsetMs: index * 2_000,
          endOffsetMs: index * 2_000 + 1_000,
        }),
      ),
    });
    const storage = createStorage();

    await expect(
      getPublicActivityEffortProfile({
        activityId: ACTIVITY_ID,
        viewerId: VIEWER_ID,
        db: oversizedFile.db,
        artifactStorage: storage,
        cache: createPublicActivityEffortProfileCache(),
      }),
    ).resolves.toBeNull();
    await expect(
      getPublicActivityEffortProfile({
        activityId: ACTIVITY_ID,
        viewerId: VIEWER_ID,
        db: oversizedSegments.db,
        artifactStorage: storage,
        cache: createPublicActivityEffortProfileCache(),
      }),
    ).resolves.toBeNull();
    expect(storage.readObjectBounded).not.toHaveBeenCalled();
  });

  it("fails closed for bounded-parser, object-size, and parser failures", async () => {
    const { db } = createDb();
    const cache = () => createPublicActivityEffortProfileCache();
    parser.parseActivityFile.mockImplementationOnce((input) => {
      expect(input).toMatchObject({
        limits: { maxRecords: PUBLIC_ACTIVITY_EFFORT_PROFILE_MAX_RECORDS },
      });
      throw new Error("record limit exceeded during decode");
    });
    await expect(
      getPublicActivityEffortProfile({
        activityId: ACTIVITY_ID,
        viewerId: VIEWER_ID,
        db,
        artifactStorage: createStorage(),
        cache: cache(),
      }),
    ).resolves.toBeNull();

    await expect(
      getPublicActivityEffortProfile({
        activityId: ACTIVITY_ID,
        viewerId: VIEWER_ID,
        db,
        artifactStorage: createStorage(new Uint8Array([1, 2])),
        cache: cache(),
      }),
    ).resolves.toBeNull();

    parser.parseActivityFile.mockImplementationOnce(() => {
      throw new Error("malformed file");
    });
    await expect(
      getPublicActivityEffortProfile({
        activityId: ACTIVITY_ID,
        viewerId: VIEWER_ID,
        db,
        artifactStorage: createStorage(),
        cache: cache(),
      }),
    ).resolves.toBeNull();
  });
});
