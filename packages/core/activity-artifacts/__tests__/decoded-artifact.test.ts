import { describe, expect, it } from "vitest";

import { decodedActivityArtifactSchema } from "../decoded-artifact-schema";
import {
  DECODED_ARTIFACT_EXTENSION_LIMITS,
  decodedArtifactExtensionsSchema,
  getDecodedArtifactExtensionEntryCount,
  isDecodedArtifactExtensionByteLengthWithinLimit,
  isDecodedArtifactExtensionEntryCountWithinLimit,
} from "../extensions";

const baseArtifact = {
  version: 1 as const,
  parser: { name: "fit-sdk", version: "21.188.0" },
  source: { standard: "fit" as const, format: "fit" as const },
  activity: { rawType: 0, rawSport: "multisport" },
  sessions: [
    { messageIndex: 0, rawSport: 1, rawSubSport: 0 },
    { messageIndex: 1, rawSport: 2, rawSubSport: 6 },
  ],
  laps: [{ messageIndex: 0, sessionMessageIndex: 1 }],
  events: [{ messageIndex: 4, sessionMessageIndex: 1, lapMessageIndex: 0, rawEvent: 0 }],
  recordCollections: [
    {
      storage: "external" as const,
      version: 1 as const,
      ownership: { sessionMessageIndex: 1, lapMessageIndex: 0 },
      chunk: {
        id: "session-1-lap-0-chunk-0",
        ordinal: 0,
        firstMessageIndex: 0,
        lastMessageIndex: 19_999,
      },
      handle: {
        scheme: "artifact-range" as const,
        locator: "records/part-1",
        encoding: "fit-record-v1",
        recordCount: 20_000,
      },
    },
  ],
};

describe("decoded activity artifact envelope", () => {
  it("preserves source session, raw sport, ownership, event, and external record facts", () => {
    expect(decodedActivityArtifactSchema.parse(baseArtifact)).toEqual(baseArtifact);
  });

  it("rejects unknown top-level fields and invalid ownership", () => {
    expect(
      decodedActivityArtifactSchema.safeParse({ ...baseArtifact, vendorPayload: {} }).success,
    ).toBe(false);
    expect(
      decodedActivityArtifactSchema.safeParse({
        ...baseArtifact,
        laps: [{ messageIndex: 0, sessionMessageIndex: 99 }],
      }).success,
    ).toBe(false);
    expect(
      decodedActivityArtifactSchema.safeParse({
        ...baseArtifact,
        events: [
          { messageIndex: 1, sessionMessageIndex: 0, lapMessageIndex: 0, rawEvent: "timer" },
        ],
      }).success,
    ).toBe(false);
    expect(
      decodedActivityArtifactSchema.safeParse({
        ...baseArtifact,
        recordCollections: [
          {
            storage: "inline",
            version: 1,
            records: [{ messageIndex: 0, sessionMessageIndex: 99 }],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires typed external ownership and accepts ordered chunks for one session/lap", () => {
    const collection = baseArtifact.recordCollections[0];
    if (!collection) throw new Error("Fixture requires an external collection.");
    expect(
      decodedActivityArtifactSchema.safeParse({
        ...baseArtifact,
        recordCollections: [
          collection,
          {
            ...collection,
            chunk: {
              id: "session-1-lap-0-chunk-1",
              ordinal: 1,
              firstMessageIndex: 20_000,
              lastMessageIndex: 29_999,
            },
            handle: { ...collection.handle, recordCount: 10_000 },
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      decodedActivityArtifactSchema.safeParse({
        ...baseArtifact,
        recordCollections: [
          {
            ...collection,
            ownership: { sessionMessageIndex: 0, lapMessageIndex: 0 },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate IDs, overlap, invalid bounds, and nondeterministic chunk order", () => {
    const collection = baseArtifact.recordCollections[0];
    if (!collection) throw new Error("Fixture requires an external collection.");
    const parseSecond = (chunk: unknown) =>
      decodedActivityArtifactSchema.safeParse({
        ...baseArtifact,
        recordCollections: [collection, { ...collection, chunk }],
      }).success;

    expect(
      parseSecond({
        id: "session-1-lap-0-chunk-0",
        ordinal: 1,
        firstMessageIndex: 20_000,
        lastMessageIndex: 29_999,
      }),
    ).toBe(false);
    expect(
      parseSecond({
        id: "session-1-lap-0-chunk-1",
        ordinal: 1,
        firstMessageIndex: 19_999,
        lastMessageIndex: 29_999,
      }),
    ).toBe(false);
    expect(
      parseSecond({
        id: "session-1-lap-0-chunk-1",
        ordinal: 2,
        firstMessageIndex: 20_000,
        lastMessageIndex: 29_999,
      }),
    ).toBe(false);
    expect(
      parseSecond({
        id: "session-1-lap-0-chunk-1",
        ordinal: 1,
        firstMessageIndex: 30_000,
        lastMessageIndex: 20_000,
      }),
    ).toBe(false);
    expect(
      decodedActivityArtifactSchema.safeParse({
        ...baseArtifact,
        recordCollections: [
          {
            ...collection,
            chunk: {
              id: "too-small",
              ordinal: 0,
              firstMessageIndex: 0,
              lastMessageIndex: 9,
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("validates activity, session, and lap source ranges consistently", () => {
    expect(
      decodedActivityArtifactSchema.safeParse({
        ...baseArtifact,
        activity: { ...baseArtifact.activity, startTimeMs: 2, endTimeMs: 1 },
      }).success,
    ).toBe(false);
    expect(
      decodedActivityArtifactSchema.safeParse({
        ...baseArtifact,
        sessions: [{ ...baseArtifact.sessions[0], startTimeMs: 2, endTimeMs: 2 }],
        laps: [],
        events: [],
        recordCollections: [],
      }).success,
    ).toBe(false);
    expect(
      decodedActivityArtifactSchema.safeParse({
        ...baseArtifact,
        laps: [{ ...baseArtifact.laps[0], startTimeMs: 3, endTimeMs: 2 }],
      }).success,
    ).toBe(false);
  });

  it("bounds extension depth, keys, arrays, entries, and values", () => {
    expect(
      decodedArtifactExtensionsSchema.safeParse({ developer_field: { value: 1 } }).success,
    ).toBe(true);
    expect(decodedArtifactExtensionsSchema.safeParse({ "bad key": 1 }).success).toBe(false);
    expect(
      decodedArtifactExtensionsSchema.safeParse({ values: Array.from({ length: 65 }, () => 1) })
        .success,
    ).toBe(false);
    expect(decodedArtifactExtensionsSchema.safeParse({ value: "x".repeat(1_025) }).success).toBe(
      false,
    );
    expect(
      decodedArtifactExtensionsSchema.safeParse({ a: { b: { c: { d: { e: { f: 1 } } } } } })
        .success,
    ).toBe(false);
  });

  it("accepts extension values exactly at practical boundaries", () => {
    const keys = Object.fromEntries(
      Array.from({ length: 64 }, (_, index) => [`key_${index}`, index]),
    );
    expect(decodedArtifactExtensionsSchema.safeParse(keys).success).toBe(true);
    expect(
      decodedArtifactExtensionsSchema.safeParse({
        values: Array.from({ length: 64 }, () => 1),
        text: "x".repeat(1_024),
        nested: { a: { b: { c: { d: "boundary" } } } },
      }).success,
    ).toBe(true);
    expect(
      decodedArtifactExtensionsSchema.safeParse({
        ...keys,
        key_64: 64,
      }).success,
    ).toBe(false);
  });

  it("accepts exact 64 KiB and 256-entry limits and rejects one over", () => {
    expect(
      isDecodedArtifactExtensionByteLengthWithinLimit(
        DECODED_ARTIFACT_EXTENSION_LIMITS.maxEncodedBytes,
      ),
    ).toBe(true);
    expect(
      isDecodedArtifactExtensionByteLengthWithinLimit(
        DECODED_ARTIFACT_EXTENSION_LIMITS.maxEncodedBytes + 1,
      ),
    ).toBe(false);

    const exactEntries = Object.fromEntries(
      Array.from({ length: 64 }, (_, index) => [`key_${index}`, [0, 1, 2]]),
    );
    const overEntries = { ...exactEntries, key_0: [0, 1, 2, 3] };
    expect(getDecodedArtifactExtensionEntryCount(exactEntries)).toBe(256);
    expect(isDecodedArtifactExtensionEntryCountWithinLimit(256)).toBe(true);
    expect(decodedArtifactExtensionsSchema.safeParse(exactEntries).success).toBe(true);
    expect(getDecodedArtifactExtensionEntryCount(overEntries)).toBe(257);
    expect(isDecodedArtifactExtensionEntryCountWithinLimit(257)).toBe(false);
    expect(decodedArtifactExtensionsSchema.safeParse(overEntries).success).toBe(false);
  });
});
