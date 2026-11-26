import { createHash } from "node:crypto";
import { receiptFingerprint } from "@repo/core/chatbot";
import { chatbotOperationReceipts } from "@repo/db";
import { and, eq, sql } from "drizzle-orm";
import superjson from "superjson";
import { z } from "zod";
import type { DrizzleTransactionClient } from "../db";

const operationIdSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);
const commandSchema = z.string().regex(/^chatbot[.][a-z0-9_.-]{2,80}$/);
const maxSerializedPayloadBytes = 256 * 1024;
const receiptEnvelopeSchema = z
  .object({
    version: z.literal(1),
    value: z.object({ json: z.unknown(), meta: z.unknown().optional() }).strict(),
  })
  .strict();

export class OperationReceiptConflictError extends Error {
  override name = "OperationReceiptConflictError";
}

export class OperationReceiptUnauthorizedError extends Error {
  override name = "OperationReceiptUnauthorizedError";
}

export class OperationReceiptCorruptError extends Error {
  override name = "OperationReceiptCorruptError";
}

type OutputSchema<T> = z.ZodType<T>;

function normalizeJsonPayload(value: unknown, label: string): unknown {
  const seen = new WeakSet<object>();
  const rejectUnsupportedValue = (candidate: unknown): void => {
    if (candidate instanceof Date)
      throw new OperationReceiptCorruptError(`${label} must not contain Date`);
    if (candidate === undefined || typeof candidate === "function" || typeof candidate === "symbol")
      throw new OperationReceiptCorruptError(`${label} must be JSON-serializable`);
    if (candidate && typeof candidate === "object") {
      if (seen.has(candidate))
        throw new OperationReceiptCorruptError(`${label} must not be circular`);
      seen.add(candidate);
      for (const child of Array.isArray(candidate) ? candidate : Object.values(candidate))
        rejectUnsupportedValue(child);
      seen.delete(candidate);
    }
  };

  rejectUnsupportedValue(value);
  const encoded = JSON.stringify(value);
  if (encoded === undefined)
    throw new OperationReceiptCorruptError(`${label} must be JSON-serializable`);
  if (Buffer.byteLength(encoded, "utf8") > maxSerializedPayloadBytes)
    throw new OperationReceiptCorruptError(`${label} exceeds the 256 KiB limit`);
  return JSON.parse(encoded) as unknown;
}

function serializeResult<T>(result: T) {
  const serialized = superjson.serialize(result);
  const jsonValue = normalizeJsonPayload(serialized, "Operation receipt result");
  return receiptEnvelopeSchema.parse({ version: 1, value: jsonValue });
}

/**
 * Runs one chatbot command inside an already-open transaction. The transaction
 * fence makes lost acknowledgements replay the validated durable result rather
 * than repeat the mutation. This helper deliberately never opens a transaction.
 */
export async function executeWithOperationReceipt<T>(input: {
  tx: DrizzleTransactionClient;
  actorId: string;
  operationId?: string;
  command: string;
  semanticInput: unknown;
  output: OutputSchema<T>;
  authorize: (tx: DrizzleTransactionClient) => Promise<boolean | undefined>;
  mutate: (tx: DrizzleTransactionClient) => Promise<T>;
}): Promise<T> {
  const semanticInput = normalizeJsonPayload(input.semanticInput, "Operation receipt input");
  if (!input.operationId) {
    const authorized = await input.authorize(input.tx);
    if (authorized === false) throw new OperationReceiptUnauthorizedError();
    return input.output.parse(await input.mutate(input.tx));
  }

  const operationId = operationIdSchema.parse(input.operationId);
  const command = commandSchema.parse(input.command);
  const fingerprint = await receiptFingerprint(command, semanticInput, async (value) =>
    createHash("sha256").update(value).digest("hex"),
  );

  await input.tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${input.actorId}:${operationId}`}, 0))`,
  );
  // The waiter must re-authorize only after it owns the receipt fence: access can
  // be revoked while it is waiting for an in-flight operation to finish.
  const authorized = await input.authorize(input.tx);
  if (authorized === false) throw new OperationReceiptUnauthorizedError();
  const [existing] = await input.tx
    .select({
      command: chatbotOperationReceipts.command,
      requestFingerprint: chatbotOperationReceipts.request_fingerprint,
      result: chatbotOperationReceipts.result,
    })
    .from(chatbotOperationReceipts)
    .where(
      and(
        eq(chatbotOperationReceipts.profile_id, input.actorId),
        eq(chatbotOperationReceipts.operation_id, operationId),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.command !== command || existing.requestFingerprint !== fingerprint)
      throw new OperationReceiptConflictError();
    try {
      const envelope = receiptEnvelopeSchema.parse(existing.result);
      // The persisted JSONB envelope is structural-untrusted; deserialize then
      // validate against the caller's public output contract below.
      return input.output.parse(superjson.parse<T>(JSON.stringify(envelope.value)));
    } catch (error) {
      if (error instanceof OperationReceiptConflictError) throw error;
      throw new OperationReceiptCorruptError("Stored operation receipt is invalid", {
        cause: error,
      });
    }
  }

  const result = input.output.parse(await input.mutate(input.tx));
  const envelope = serializeResult(result);
  await input.tx.insert(chatbotOperationReceipts).values({
    profile_id: input.actorId,
    operation_id: operationId,
    command,
    request_fingerprint: fingerprint,
    result: envelope,
  });
  return result;
}
