import type { ChatbotHostOutcome } from "@repo/api/chatbot/host";
import type { ApiRateLimitResult } from "@repo/api/chatbot/rate-limit";
import type { ChatbotRecoveryOutcome } from "@repo/api/chatbot/recovery";
import type { ApiContext } from "@repo/api/context";
import { hasCurrentContractEpoch } from "@repo/api/contract-epoch";
import {
  chatbotRecoveryRequestSchema,
  chatbotStatusRequestSchema,
} from "@repo/api/contracts/chatbot";

const MAX_CHATBOT_BODY_BYTES = 16 * 1024;

export type ChatbotHost = (
  context: ApiContext,
  request: unknown,
  signal?: AbortSignal,
) => Promise<Response | ChatbotHostOutcome>;

export interface ChatbotHttpDependencies {
  createContext(request: Request): Promise<ApiContext>;
  checkRateLimit(context: ApiContext): Promise<ApiRateLimitResult>;
  host: ChatbotHost;
  recovery?: {
    status(context: ApiContext, threadId: string): Promise<unknown>;
    recover(
      context: ApiContext,
      input: { threadId: string; turnId: string },
    ): Promise<ChatbotRecoveryOutcome>;
  };
}

export function createChatbotHttpHandler(dependencies: ChatbotHttpDependencies) {
  return async function handleChatbotHttpRequest(request: Request): Promise<Response> {
    if (request.method !== "POST" && request.method !== "GET") return methodNotAllowed();

    const context = await dependencies.createContext(request);
    if (!context.session?.user) return jsonError(401, "unauthorized");
    if (request.method === "POST" && !isAllowedMutationOrigin(request, context))
      return jsonError(403, "forbidden");
    if (!hasCurrentContractEpoch(request.headers))
      return jsonError(412, "unsupported_contract_epoch");

    const rateLimit = await dependencies.checkRateLimit(context);
    if (!rateLimit.allowed) {
      return jsonError(429, "rate_limited", {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      });
    }
    if (request.method === "GET") {
      const parsed = chatbotStatusRequestSchema.safeParse({
        threadId: new URL(request.url).searchParams.get("threadId"),
      });
      if (!parsed.success || !dependencies.recovery) return jsonError(400, "invalid_request");
      try {
        return mapRecoveryOutcome(
          await dependencies.recovery.status(context, parsed.data.threadId),
        );
      } catch {
        return jsonError(503, "chatbot_unavailable");
      }
    }

    if (!isJsonContentType(request.headers.get("content-type"))) {
      return jsonError(415, "unsupported_media_type");
    }

    const contentLength = request.headers.get("content-length");
    if (
      contentLength &&
      (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_CHATBOT_BODY_BYTES)
    ) {
      return jsonError(413, "payload_too_large");
    }

    const body = await readBoundedJson(request);
    if (!body.ok) return jsonError(body.status, body.code);

    const recovery = chatbotRecoveryRequestSchema.safeParse(body.value);
    if (recovery.success) {
      if (!dependencies.recovery) return jsonError(503, "chatbot_unavailable");
      try {
        return mapRecoveryOutcome(await dependencies.recovery.recover(context, recovery.data));
      } catch {
        return jsonError(503, "chatbot_unavailable");
      }
    }
    try {
      return mapHostOutcome(await dependencies.host(context, body.value, request.signal));
    } catch {
      return jsonError(503, "chatbot_unavailable");
    }
  };
}

function methodNotAllowed() {
  return jsonError(405, "method_not_allowed", { Allow: "GET, POST" });
}

function mapRecoveryOutcome(outcome: unknown): Response {
  if (!outcome || typeof outcome !== "object" || !("kind" in outcome))
    return jsonError(503, "chatbot_unavailable");
  const value = outcome as { kind: string; status?: number; code?: string };
  if (value.kind === "error")
    return jsonError(value.status ?? 503, value.code ?? "chatbot_unavailable");
  if (value.kind === "status" || value.kind === "completed" || value.kind === "unresolved")
    return privateJson(outcome, { status: value.kind === "unresolved" ? 409 : 200 });
  return jsonError(503, "chatbot_unavailable");
}

function jsonError(status: number, error: string, headers?: HeadersInit) {
  return privateJson({ error }, { status, ...(headers ? { headers } : {}) });
}

function privateJson(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(value, { ...init, headers });
}

function isJsonContentType(value: string | null) {
  return value?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

function isAllowedMutationOrigin(request: Request, context: ApiContext) {
  const origin = request.headers.get("origin");
  const session = context.session;
  const sameOrigin = origin === new URL(request.url).origin;

  // Cookie sessions are browser ambient authority and must always present the
  // first-party origin. Bearer sessions are supported only for the declared
  // native transport when no Origin header exists; an Origin is never bypassed.
  if (session?.transport === "cookie") return sameOrigin;
  if (origin) return sameOrigin;
  return session?.transport === "bearer" && context.clientType === "mobile";
}

type ParsedBody =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; code: "invalid_json" | "payload_too_large" };

async function readBoundedJson(request: Request): Promise<ParsedBody> {
  if (!request.body) return { ok: false, status: 400, code: "invalid_json" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_CHATBOT_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, status: 413, code: "payload_too_large" };
      }
      chunks.push(next.value);
    }
  } catch {
    return { ok: false, status: 400, code: "invalid_json" };
  }

  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, status: 400, code: "invalid_json" };
  }
}

function mapHostOutcome(outcome: Response | ChatbotHostOutcome): Response {
  if (outcome instanceof Response) {
    const headers = new Headers(outcome.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(outcome.body, {
      headers,
      status: outcome.status,
      statusText: outcome.statusText,
    });
  }
  if (outcome.kind === "error") return jsonError(outcome.status, outcome.code);
  if (outcome.kind === "replay") {
    return privateJson({
      status: "completed",
      text: outcome.text,
      threadId: outcome.threadId,
      turnId: outcome.turnId,
    });
  }
  return privateJson(
    { status: outcome.status, threadId: outcome.threadId, turnId: outcome.turnId },
    { status: 409 },
  );
}
