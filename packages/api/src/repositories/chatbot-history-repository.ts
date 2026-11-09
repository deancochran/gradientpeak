import { createHash, randomUUID } from "node:crypto";
import type { DrizzleDbClient } from "@repo/db";
import { chatbotActions, chatbotThreads, chatbotTurns } from "@repo/db";
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import {
  type ChatbotHistoryMessage,
  type ChatbotRequest,
  type ChatbotTurnStatus,
  chatbotHistoryMessageSchema,
} from "../contracts/chatbot";

export type ChatbotTurnRecord = {
  id: string;
  threadId: string;
  requestFingerprint: string;
  status: ChatbotTurnStatus;
  input: ChatbotHistoryMessage;
  output: ChatbotHistoryMessage | null;
  leaseExpiresAt: Date | null;
};
export type ChatbotActionRecord = {
  id: string;
  actionId: string;
  toolCallId: string;
  toolId: string;
  input: Record<string, unknown>;
  status: "pending" | "completed" | "failed" | "unknown";
  result: unknown;
};
export type ChatbotRecoveryTurn = ChatbotTurnRecord & { actions: readonly ChatbotActionRecord[] };
type Claim =
  | { kind: "claimed" | "duplicate"; turn: ChatbotTurnRecord }
  | { kind: "conflict" | "active" | "denied" | "recovery_required" };

export interface ChatbotHistoryRepository {
  claim(input: {
    actorId: string;
    request: ChatbotRequest;
    now: Date;
    leaseMs: number;
  }): Promise<Claim>;
  finish(input: {
    actorId: string;
    turnId: string;
    status: Exclude<ChatbotTurnStatus, "running">;
    output?: ChatbotHistoryMessage;
    now: Date;
  }): Promise<boolean>;
  history(
    actorId: string,
    threadId: string,
    limit?: number,
  ): Promise<readonly ChatbotHistoryMessage[] | null>;
  /** Completed turns plus this live turn's input; incomplete older turns are not model context. */
  historyForTurn(input: {
    actorId: string;
    threadId: string;
    turnId: string;
    limit?: number;
  }): Promise<readonly ChatbotHistoryMessage[] | null>;
  isActive(input: { actorId: string; turnId: string; now: Date }): Promise<boolean>;
  interruptExpired(now: Date): Promise<number>;
  persistAction(input: {
    actorId: string;
    turnId: string;
    toolCallId: string;
    toolId: string;
    input: Record<string, unknown>;
    now: Date;
  }): Promise<ChatbotActionRecord | "conflict" | "denied" | "inactive">;
  finishAction(input: {
    actorId: string;
    turnId: string;
    actionId: string;
    status: "completed" | "failed" | "unknown";
    result?: unknown;
    now: Date;
  }): Promise<boolean>;
  status(input: {
    actorId: string;
    threadId: string;
    limit?: number;
  }): Promise<readonly ChatbotRecoveryTurn[] | null>;
  loadRecovery(input: {
    actorId: string;
    threadId: string;
    turnId: string;
    now: Date;
  }): Promise<ChatbotRecoveryTurn | "running" | "denied" | "missing">;
  reconcileAction(input: {
    actorId: string;
    turnId: string;
    actionId: string;
    result: unknown;
    now: Date;
  }): Promise<boolean>;
  completeRecovery(input: {
    actorId: string;
    turnId: string;
    output: ChatbotHistoryMessage;
    now: Date;
  }): Promise<boolean>;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite action input");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  throw new Error("Unsupported action input");
}
const fingerprint = (value: unknown) =>
  `v1:sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
const derivedThreadId = (actorId: string, requestId: string) => {
  const hex = createHash("sha256").update(`${actorId}:${requestId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const asMessage = (value: unknown) => chatbotHistoryMessageSchema.safeParse(value);
function turn(row: typeof chatbotTurns.$inferSelect): ChatbotTurnRecord {
  const input = asMessage(row.input);
  const output = row.output === null ? null : asMessage(row.output);
  if (!input.success || (output !== null && !output.success))
    throw new Error("Corrupt chatbot history");
  return {
    id: row.id,
    threadId: row.thread_id,
    requestFingerprint: row.request_fingerprint,
    status: row.status as ChatbotTurnStatus,
    input: input.data,
    output: output?.data ?? null,
    leaseExpiresAt: row.lease_expires_at,
  };
}
function action(row: typeof chatbotActions.$inferSelect): ChatbotActionRecord {
  if (!row.input || typeof row.input !== "object" || Array.isArray(row.input))
    throw new Error("Corrupt chatbot action");
  if (row.input_fingerprint !== fingerprint(row.input)) throw new Error("Corrupt chatbot action");
  return {
    id: row.id,
    actionId: row.action_id,
    toolCallId: row.tool_call_id,
    toolId: row.tool_id,
    input: row.input as Record<string, unknown>,
    status: row.status as ChatbotActionRecord["status"],
    result: row.result,
  };
}

export function createDrizzleChatbotHistoryRepository(
  db: DrizzleDbClient,
  options: { now?: () => Date } = {},
): ChatbotHistoryRepository {
  const wallClock = options.now ?? (() => new Date());
  return {
    async claim({ actorId, request, now, leaseMs }) {
      const threadId = request.threadId ?? derivedThreadId(actorId, request.requestId);
      const input = { role: "user" as const, text: request.text };
      const requestFingerprint = fingerprint(input);
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${threadId}, 0))`);
        const [existingThread] = await tx
          .select()
          .from(chatbotThreads)
          .where(eq(chatbotThreads.id, threadId))
          .limit(1);
        if (existingThread && existingThread.profile_id !== actorId)
          return { kind: "denied" as const };
        if (!existingThread)
          await tx.insert(chatbotThreads).values({ id: threadId, profile_id: actorId });
        await tx
          .update(chatbotTurns)
          .set({ status: "interrupted", completed_at: now, lease_expires_at: null })
          .where(
            and(
              eq(chatbotTurns.thread_id, threadId),
              eq(chatbotTurns.status, "running"),
              lt(chatbotTurns.lease_expires_at, now),
            ),
          );
        const [same] = await tx
          .select()
          .from(chatbotTurns)
          .where(
            and(
              eq(chatbotTurns.thread_id, threadId),
              eq(chatbotTurns.request_id, request.requestId),
            ),
          )
          .limit(1);
        if (same)
          return same.request_fingerprint === requestFingerprint
            ? { kind: "duplicate" as const, turn: turn(same) }
            : { kind: "conflict" as const };
        const [active] = await tx
          .select({ id: chatbotTurns.id })
          .from(chatbotTurns)
          .where(and(eq(chatbotTurns.thread_id, threadId), eq(chatbotTurns.status, "running")))
          .limit(1);
        if (active) return { kind: "active" as const };
        // An interrupted turn with a receipt is not safe to supersede.  A write
        // may have committed after its host lost the acknowledgement, including
        // after lease expiry.  Require explicit receipt reconciliation first.
        const [unresolved] = await tx
          .select({ id: chatbotTurns.id })
          .from(chatbotTurns)
          .innerJoin(chatbotActions, eq(chatbotActions.turn_id, chatbotTurns.id))
          .where(and(eq(chatbotTurns.thread_id, threadId), eq(chatbotTurns.status, "interrupted")))
          .limit(1);
        if (unresolved) return { kind: "recovery_required" as const };
        const [created] = await tx
          .insert(chatbotTurns)
          .values({
            thread_id: threadId,
            request_id: request.requestId,
            request_fingerprint: requestFingerprint,
            input,
            lease_expires_at: new Date(now.getTime() + leaseMs),
          })
          .returning();
        if (!created) throw new Error("Could not persist chatbot turn");
        return { kind: "claimed" as const, turn: turn(created) };
      });
    },
    async finish({ actorId, turnId, status, output, now }) {
      if (output && !chatbotHistoryMessageSchema.safeParse(output).success) return false;
      const rows = await db
        .update(chatbotTurns)
        .set({ status, output, completed_at: now, lease_expires_at: null })
        .where(
          and(
            eq(chatbotTurns.id, turnId),
            eq(chatbotTurns.status, "running"),
            sql`${chatbotTurns.lease_expires_at} >= ${now}`,
            sql`exists (select 1 from public.chatbot_threads t where t.id = ${chatbotTurns.thread_id} and t.profile_id = ${actorId})`,
          ),
        )
        .returning({ id: chatbotTurns.id });
      return rows.length === 1;
    },
    async history(actorId, threadId, limit = 40) {
      const rows = await db
        .select({ input: chatbotTurns.input, output: chatbotTurns.output })
        .from(chatbotTurns)
        .innerJoin(chatbotThreads, eq(chatbotTurns.thread_id, chatbotThreads.id))
        .where(and(eq(chatbotThreads.id, threadId), eq(chatbotThreads.profile_id, actorId)))
        .orderBy(desc(chatbotTurns.created_at), desc(chatbotTurns.id))
        .limit(Math.min(Math.max(limit, 1), 40));
      if (!rows.length) return null;
      return rows.reverse().flatMap((row) => {
        const input = asMessage(row.input);
        const output = row.output === null ? null : asMessage(row.output);
        if (!input.success || (output && !output.success))
          throw new Error("Corrupt chatbot history");
        return [input.data, ...(output ? [output.data] : [])];
      });
    },
    async historyForTurn({ actorId, threadId, turnId, limit = 40 }) {
      const rows = await db
        .select({
          id: chatbotTurns.id,
          status: chatbotTurns.status,
          input: chatbotTurns.input,
          output: chatbotTurns.output,
        })
        .from(chatbotTurns)
        .innerJoin(chatbotThreads, eq(chatbotTurns.thread_id, chatbotThreads.id))
        .where(and(eq(chatbotThreads.id, threadId), eq(chatbotThreads.profile_id, actorId)))
        .orderBy(desc(chatbotTurns.created_at), desc(chatbotTurns.id))
        .limit(Math.min(Math.max(limit, 1), 40));
      if (!rows.length) return null;
      return rows.reverse().flatMap((row) => {
        if (row.id !== turnId && row.status !== "completed") return [];
        const input = asMessage(row.input);
        const output = row.output === null ? null : asMessage(row.output);
        if (!input.success || (output && !output.success))
          throw new Error("Corrupt chatbot history");
        return [input.data, ...(row.status === "completed" && output ? [output.data] : [])];
      });
    },
    async isActive({ actorId, turnId, now }) {
      const rows = await db
        .select({ id: chatbotTurns.id })
        .from(chatbotTurns)
        .innerJoin(chatbotThreads, eq(chatbotTurns.thread_id, chatbotThreads.id))
        .where(
          and(
            eq(chatbotTurns.id, turnId),
            eq(chatbotThreads.profile_id, actorId),
            eq(chatbotTurns.status, "running"),
            sql`${chatbotTurns.lease_expires_at} >= ${now}`,
          ),
        )
        .limit(1);
      return rows.length === 1;
    },
    async interruptExpired(now) {
      const rows = await db
        .update(chatbotTurns)
        .set({ status: "interrupted", completed_at: now, lease_expires_at: null })
        .where(and(eq(chatbotTurns.status, "running"), lt(chatbotTurns.lease_expires_at, now)))
        .returning({ id: chatbotTurns.id });
      return rows.length;
    },
    async persistAction({ actorId, turnId, toolCallId, toolId, input, now }) {
      const inputFingerprint = fingerprint(input);
      return db.transaction(async (tx) => {
        // This lookup identifies the lock namespace only.  It deliberately does
        // not admit the action: a successor may interrupt this turn while this
        // transaction waits for the per-thread lock.
        const [owned] = await tx
          .select({ threadId: chatbotTurns.thread_id })
          .from(chatbotTurns)
          .innerJoin(chatbotThreads, eq(chatbotTurns.thread_id, chatbotThreads.id))
          .where(and(eq(chatbotTurns.id, turnId), eq(chatbotThreads.profile_id, actorId)))
          .limit(1);
        if (!owned) return "inactive" as const;
        // Serialize receipt insertion with claim on the same thread.  This
        // closes the isActive -> journal insert -> dispatch admission race:
        // claim cannot create a newer turn until this intent is durable.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${owned.threadId}, 0))`);
        // `now` is an injected lower bound for deterministic lease tests. Read a
        // fresh wall clock after a potentially long lock wait so a stale host
        // cannot use its pre-wait snapshot to journal into an expired turn.
        const effectiveNow = new Date(Math.max(now.getTime(), wallClock().getTime()));
        const [active] = await tx
          .select({ id: chatbotTurns.id })
          .from(chatbotTurns)
          .innerJoin(chatbotThreads, eq(chatbotTurns.thread_id, chatbotThreads.id))
          .where(
            and(
              eq(chatbotTurns.id, turnId),
              eq(chatbotThreads.profile_id, actorId),
              eq(chatbotTurns.status, "running"),
              sql`${chatbotTurns.lease_expires_at} >= ${effectiveNow}`,
            ),
          )
          .limit(1);
        if (!active) return "inactive" as const;
        const [same] = await tx
          .select()
          .from(chatbotActions)
          .where(
            and(eq(chatbotActions.turn_id, turnId), eq(chatbotActions.tool_call_id, toolCallId)),
          )
          .limit(1);
        if (same)
          return same.tool_id === toolId && same.input_fingerprint === inputFingerprint
            ? action(same)
            : ("conflict" as const);
        const [created] = await tx
          .insert(chatbotActions)
          .values({
            turn_id: turnId,
            action_id: randomUUID(),
            tool_call_id: toolCallId,
            tool_id: toolId,
            input,
            input_fingerprint: inputFingerprint,
          })
          .returning();
        if (!created) throw new Error("Could not persist chatbot action");
        return action(created);
      });
    },
    async finishAction({ actorId, turnId, actionId, status, result, now }) {
      const rows = await db
        .update(chatbotActions)
        .set({ status, result, completed_at: now })
        .where(
          and(
            eq(chatbotActions.turn_id, turnId),
            eq(chatbotActions.action_id, actionId),
            eq(chatbotActions.status, "pending"),
            sql`exists (select 1 from public.chatbot_turns x join public.chatbot_threads t on t.id = x.thread_id where x.id = ${turnId} and t.profile_id = ${actorId})`,
          ),
        )
        .returning({ id: chatbotActions.id });
      return rows.length === 1;
    },
    async status({ actorId, threadId, limit = 20 }) {
      const rows = await db
        .select()
        .from(chatbotTurns)
        .innerJoin(chatbotThreads, eq(chatbotTurns.thread_id, chatbotThreads.id))
        .where(and(eq(chatbotThreads.id, threadId), eq(chatbotThreads.profile_id, actorId)))
        .orderBy(desc(chatbotTurns.created_at), desc(chatbotTurns.id))
        .limit(Math.min(Math.max(limit, 1), 20));
      if (!rows.length) return null;
      const turns = await Promise.all(
        rows.map(async ({ chatbot_turns: row }) => ({
          ...turn(row),
          actions: (
            await db
              .select()
              .from(chatbotActions)
              .where(eq(chatbotActions.turn_id, row.id))
              .orderBy(asc(chatbotActions.created_at), asc(chatbotActions.id))
          ).map(action),
        })),
      );
      return turns;
    },
    async loadRecovery({ actorId, threadId, turnId, now }) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${threadId}, 0))`);
        const [row] = await tx
          .select()
          .from(chatbotTurns)
          .innerJoin(chatbotThreads, eq(chatbotTurns.thread_id, chatbotThreads.id))
          .where(and(eq(chatbotTurns.id, turnId), eq(chatbotTurns.thread_id, threadId)))
          .limit(1);
        if (!row) return "missing" as const;
        if (row.chatbot_threads.profile_id !== actorId) return "denied" as const;
        if (row.chatbot_turns.status === "running") {
          if (!row.chatbot_turns.lease_expires_at || row.chatbot_turns.lease_expires_at >= now)
            return "running" as const;
          await tx
            .update(chatbotTurns)
            .set({ status: "interrupted", completed_at: now, lease_expires_at: null })
            .where(
              and(
                eq(chatbotTurns.id, turnId),
                eq(chatbotTurns.status, "running"),
                lt(chatbotTurns.lease_expires_at, now),
              ),
            );
        }
        const [fresh] = await tx
          .select()
          .from(chatbotTurns)
          .where(eq(chatbotTurns.id, turnId))
          .limit(1);
        if (!fresh || (fresh.status !== "interrupted" && fresh.status !== "completed"))
          return "missing" as const;
        const actions = (
          await tx
            .select()
            .from(chatbotActions)
            .where(eq(chatbotActions.turn_id, turnId))
            .orderBy(asc(chatbotActions.created_at), asc(chatbotActions.id))
            .limit(21)
        ).map(action);
        if (actions.length > 20) throw new Error("Too many chatbot actions to recover");
        return { ...turn(fresh), actions };
      });
    },
    async reconcileAction({ actorId, turnId, actionId, result, now }) {
      const rows = await db
        .update(chatbotActions)
        .set({ status: "completed", result, completed_at: now })
        .where(
          and(
            eq(chatbotActions.turn_id, turnId),
            eq(chatbotActions.action_id, actionId),
            sql`${chatbotActions.status} in ('pending', 'unknown')`,
            sql`exists (select 1 from public.chatbot_turns x join public.chatbot_threads t on t.id=x.thread_id where x.id=${turnId} and x.status='interrupted' and t.profile_id=${actorId})`,
          ),
        )
        .returning({ id: chatbotActions.id });
      return rows.length === 1;
    },
    async completeRecovery({ actorId, turnId, output, now }) {
      if (!chatbotHistoryMessageSchema.safeParse(output).success) return false;
      return db.transaction(async (tx) => {
        const [owned] = await tx
          .select({ threadId: chatbotTurns.thread_id })
          .from(chatbotTurns)
          .innerJoin(chatbotThreads, eq(chatbotTurns.thread_id, chatbotThreads.id))
          .where(
            and(
              eq(chatbotTurns.id, turnId),
              eq(chatbotTurns.status, "interrupted"),
              eq(chatbotThreads.profile_id, actorId),
            ),
          )
          .limit(1);
        if (!owned) return false;
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${owned.threadId}, 0))`);
        const [unresolved] = await tx
          .select({ id: chatbotActions.id })
          .from(chatbotActions)
          .where(
            and(eq(chatbotActions.turn_id, turnId), sql`${chatbotActions.status} <> 'completed'`),
          )
          .limit(1);
        if (unresolved) return false;
        const rows = await tx
          .update(chatbotTurns)
          .set({ status: "completed", output, completed_at: now, lease_expires_at: null })
          .where(and(eq(chatbotTurns.id, turnId), eq(chatbotTurns.status, "interrupted")))
          .returning({ id: chatbotTurns.id });
        return rows.length === 1;
      });
    },
  };
}
