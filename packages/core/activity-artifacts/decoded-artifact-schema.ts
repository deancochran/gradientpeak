import { z } from "zod";

import { decodedArtifactExtensionsSchema } from "./extensions";
import { activityArtifactSourceFormatSchema } from "./source-format";

const rawSourceValueSchema = z.union([z.string().min(1).max(128), z.number().int()]);
const rawSportFields = {
  rawSport: rawSourceValueSchema.optional(),
  rawSubSport: rawSourceValueSchema.optional(),
};
const ownershipFields = {
  sessionMessageIndex: z.number().int().nonnegative(),
  lapMessageIndex: z.number().int().nonnegative().optional(),
};

export const decodedActivityArtifactSessionSchema = z
  .object({
    messageIndex: z.number().int().nonnegative(),
    ...rawSportFields,
    startTimeMs: z.number().int().nonnegative().optional(),
    endTimeMs: z.number().int().nonnegative().optional(),
    extensions: decodedArtifactExtensionsSchema.optional(),
  })
  .strict()
  .refine(
    (session) =>
      session.startTimeMs === undefined ||
      session.endTimeMs === undefined ||
      session.startTimeMs < session.endTimeMs,
    { message: "A session start must precede its end.", path: ["endTimeMs"] },
  );

export const decodedActivityArtifactLapSchema = z
  .object({
    messageIndex: z.number().int().nonnegative(),
    sessionMessageIndex: z.number().int().nonnegative(),
    startTimeMs: z.number().int().nonnegative().optional(),
    endTimeMs: z.number().int().nonnegative().optional(),
    extensions: decodedArtifactExtensionsSchema.optional(),
  })
  .strict()
  .refine(
    (lap) =>
      lap.startTimeMs === undefined ||
      lap.endTimeMs === undefined ||
      lap.startTimeMs < lap.endTimeMs,
    { message: "A lap start must precede its end.", path: ["endTimeMs"] },
  );

export const decodedActivityArtifactEventSchema = z
  .object({
    messageIndex: z.number().int().nonnegative(),
    sessionMessageIndex: z.number().int().nonnegative().optional(),
    lapMessageIndex: z.number().int().nonnegative().optional(),
    timestampMs: z.number().int().nonnegative().optional(),
    rawEvent: rawSourceValueSchema,
    rawEventType: rawSourceValueSchema.optional(),
    extensions: decodedArtifactExtensionsSchema.optional(),
  })
  .strict();

const decodedRecordSchema = z
  .object({
    messageIndex: z.number().int().nonnegative(),
    ...ownershipFields,
    timestampMs: z.number().int().nonnegative().optional(),
    extensions: decodedArtifactExtensionsSchema.optional(),
  })
  .strict();

const recordCollectionSchema = z.discriminatedUnion("storage", [
  z
    .object({
      storage: z.literal("inline"),
      version: z.literal(1),
      records: z.array(decodedRecordSchema).max(10_000),
    })
    .strict(),
  z
    .object({
      storage: z.literal("external"),
      version: z.literal(1),
      ownership: z
        .object({
          sessionMessageIndex: z.number().int().nonnegative(),
          lapMessageIndex: z.number().int().nonnegative().optional(),
        })
        .strict(),
      chunk: z
        .object({
          id: z
            .string()
            .min(1)
            .max(128)
            .regex(/^[A-Za-z0-9._:-]+$/),
          ordinal: z.number().int().nonnegative(),
          firstMessageIndex: z.number().int().nonnegative(),
          lastMessageIndex: z.number().int().nonnegative(),
        })
        .strict()
        .refine((chunk) => chunk.firstMessageIndex <= chunk.lastMessageIndex, {
          message: "External record message-index bounds are invalid.",
          path: ["lastMessageIndex"],
        }),
      handle: z
        .object({
          scheme: z.enum(["artifact-range", "object"]),
          locator: z.string().min(1).max(1_024),
          encoding: z.string().min(1).max(64),
          recordCount: z.number().int().positive(),
        })
        .strict(),
    })
    .strict()
    .refine(
      (collection) =>
        collection.handle.recordCount <=
        collection.chunk.lastMessageIndex - collection.chunk.firstMessageIndex + 1,
      {
        message: "External record count exceeds its message-index range.",
        path: ["handle", "recordCount"],
      },
    ),
]);

const decodedActivityArtifactShapeSchema = z
  .object({
    version: z.literal(1),
    parser: z
      .object({ name: z.string().min(1).max(64), version: z.string().min(1).max(64) })
      .strict(),
    source: activityArtifactSourceFormatSchema,
    activity: z
      .object({
        rawType: rawSourceValueSchema.optional(),
        ...rawSportFields,
        startTimeMs: z.number().int().nonnegative().optional(),
        endTimeMs: z.number().int().nonnegative().optional(),
        extensions: decodedArtifactExtensionsSchema.optional(),
      })
      .strict()
      .refine(
        (activity) =>
          activity.startTimeMs === undefined ||
          activity.endTimeMs === undefined ||
          activity.startTimeMs < activity.endTimeMs,
        { message: "An activity start must precede its end.", path: ["endTimeMs"] },
      ),
    sessions: z.array(decodedActivityArtifactSessionSchema).max(64),
    laps: z.array(decodedActivityArtifactLapSchema).max(10_000),
    events: z.array(decodedActivityArtifactEventSchema).max(10_000),
    recordCollections: z.array(recordCollectionSchema).max(256),
    extensions: decodedArtifactExtensionsSchema.optional(),
  })
  .strict();

export const decodedActivityArtifactSchema = decodedActivityArtifactShapeSchema.superRefine(
  (artifact, ctx) => {
    const sessionIndexes = new Set<number>();
    for (const [index, session] of artifact.sessions.entries()) {
      if (sessionIndexes.has(session.messageIndex)) {
        ctx.addIssue({
          code: "custom",
          path: ["sessions", index, "messageIndex"],
          message: "Session message indexes must be unique.",
        });
      }
      sessionIndexes.add(session.messageIndex);
    }

    const lapKeys = new Set<string>();
    for (const [index, lap] of artifact.laps.entries()) {
      if (!sessionIndexes.has(lap.sessionMessageIndex)) {
        ctx.addIssue({
          code: "custom",
          path: ["laps", index, "sessionMessageIndex"],
          message: "Lap ownership must reference a decoded session.",
        });
      }
      const key = `${lap.sessionMessageIndex}:${lap.messageIndex}`;
      if (lapKeys.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["laps", index, "messageIndex"],
          message: "Lap message indexes must be unique within a session.",
        });
      }
      lapKeys.add(key);
    }

    for (const [index, event] of artifact.events.entries()) {
      if (
        event.sessionMessageIndex !== undefined &&
        !sessionIndexes.has(event.sessionMessageIndex)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["events", index, "sessionMessageIndex"],
          message: "Event ownership must reference a decoded session.",
        });
      }
      if (
        event.lapMessageIndex !== undefined &&
        (event.sessionMessageIndex === undefined ||
          !lapKeys.has(`${event.sessionMessageIndex}:${event.lapMessageIndex}`))
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["events", index, "lapMessageIndex"],
          message: "Event lap ownership must reference a lap in its session.",
        });
      }
    }

    const recordKeys = new Set<string>();
    const externalChunkIds = new Set<string>();
    const externalOwnerState = new Map<string, { lastMessageIndex: number; ordinal: number }>();
    for (const [collectionIndex, collection] of artifact.recordCollections.entries()) {
      if (collection.storage === "external") {
        const { sessionMessageIndex, lapMessageIndex } = collection.ownership;
        if (!sessionIndexes.has(sessionMessageIndex)) {
          ctx.addIssue({
            code: "custom",
            path: ["recordCollections", collectionIndex, "ownership", "sessionMessageIndex"],
            message: "External record ownership must reference a decoded session.",
          });
        }
        if (
          lapMessageIndex !== undefined &&
          !lapKeys.has(`${sessionMessageIndex}:${lapMessageIndex}`)
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["recordCollections", collectionIndex, "ownership", "lapMessageIndex"],
            message: "External record ownership must reference a lap in its session.",
          });
        }
        const ownershipKey = `${sessionMessageIndex}:${lapMessageIndex ?? "session"}`;
        if (externalChunkIds.has(collection.chunk.id)) {
          ctx.addIssue({
            code: "custom",
            path: ["recordCollections", collectionIndex, "chunk", "id"],
            message: "External record chunk IDs must be unique.",
          });
        }
        externalChunkIds.add(collection.chunk.id);
        const previousChunk = externalOwnerState.get(ownershipKey);
        const expectedOrdinal = previousChunk === undefined ? 0 : previousChunk.ordinal + 1;
        if (collection.chunk.ordinal !== expectedOrdinal) {
          ctx.addIssue({
            code: "custom",
            path: ["recordCollections", collectionIndex, "chunk", "ordinal"],
            message:
              "External record chunks must be ordered with contiguous owner-relative ordinals.",
          });
        }
        if (
          previousChunk !== undefined &&
          collection.chunk.firstMessageIndex <= previousChunk.lastMessageIndex
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["recordCollections", collectionIndex, "chunk", "firstMessageIndex"],
            message:
              "External record chunk message-index ranges must be ordered and non-overlapping.",
          });
        }
        externalOwnerState.set(ownershipKey, {
          lastMessageIndex: collection.chunk.lastMessageIndex,
          ordinal: collection.chunk.ordinal,
        });
        continue;
      }

      for (const [recordIndex, record] of collection.records.entries()) {
        if (!sessionIndexes.has(record.sessionMessageIndex)) {
          ctx.addIssue({
            code: "custom",
            path: [
              "recordCollections",
              collectionIndex,
              "records",
              recordIndex,
              "sessionMessageIndex",
            ],
            message: "Record ownership must reference a decoded session.",
          });
        }
        if (
          record.lapMessageIndex !== undefined &&
          !lapKeys.has(`${record.sessionMessageIndex}:${record.lapMessageIndex}`)
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["recordCollections", collectionIndex, "records", recordIndex, "lapMessageIndex"],
            message: "Record lap ownership must reference a lap in its session.",
          });
        }
        const key = `${record.sessionMessageIndex}:${record.messageIndex}`;
        if (recordKeys.has(key)) {
          ctx.addIssue({
            code: "custom",
            path: ["recordCollections", collectionIndex, "records", recordIndex, "messageIndex"],
            message: "Record message indexes must be unique within a session.",
          });
        }
        recordKeys.add(key);
      }
    }
  },
);

export type DecodedActivityArtifact = z.infer<typeof decodedActivityArtifactSchema>;
