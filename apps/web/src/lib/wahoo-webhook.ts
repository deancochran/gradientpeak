import crypto from "node:crypto";

export const WAHOO_WEBHOOK_MAX_BODY_BYTES = 256 * 1024;

export interface WahooWebhookPayload {
  event_type: string;
  webhook_token: string;
  user: {
    id: number;
  };
  workout_summary?: Record<string, unknown>;
}
type AuthenticatedWahooWebhookPayload = Omit<WahooWebhookPayload, "webhook_token">;

interface WahooWebhookHandlerDependencies {
  getToken: () => string | undefined;
  storeAndEnqueueReceipt: (payload: AuthenticatedWahooWebhookPayload) => Promise<unknown>;
  maxBodyBytes?: number;
}

class PayloadTooLargeError extends Error {}

function errorResponse(status: number, error: string) {
  return Response.json(
    { error, received: false },
    { status, headers: status === 503 ? { "Retry-After": "60" } : undefined },
  );
}

function secretsMatch(received: string, expected: string): boolean {
  const receivedDigest = crypto.createHash("sha256").update(received, "utf8").digest();
  const expectedDigest = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(receivedDigest, expectedDigest);
}

async function readBodyWithLimit(request: Request, maxBodyBytes: number): Promise<string> {
  const contentLength = request.headers.get("content-length");

  if (contentLength && Number(contentLength) > maxBodyBytes) {
    throw new PayloadTooLargeError();
  }

  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let body = "";
  let bytesRead = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    bytesRead += value.byteLength;
    if (bytesRead > maxBodyBytes) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }

    body += decoder.decode(value, { stream: true });
  }

  return body + decoder.decode();
}

function isWebhookPayload(value: unknown): value is WahooWebhookPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Record<string, unknown>;
  const user = payload.user;
  const workoutSummary = payload.workout_summary;

  return (
    typeof payload.event_type === "string" &&
    payload.event_type.trim().length > 0 &&
    typeof payload.webhook_token === "string" &&
    payload.webhook_token.length > 0 &&
    !!user &&
    typeof user === "object" &&
    Number.isSafeInteger((user as Record<string, unknown>).id) &&
    (workoutSummary === undefined ||
      (!!workoutSummary && typeof workoutSummary === "object" && !Array.isArray(workoutSummary)))
  );
}

export function verifyWahooWebhookSignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  const normalizedSignature = signature.startsWith("sha256=")
    ? signature.slice("sha256=".length)
    : signature;
  const digest = crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");

  if (!/^[a-f0-9]{64}$/i.test(normalizedSignature)) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(normalizedSignature, "hex"),
    Buffer.from(digest, "hex"),
  );
}

export function createWahooWebhookPostHandler(dependencies: WahooWebhookHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const token = dependencies.getToken()?.trim();

    if (!token) {
      console.error("WAHOO_WEBHOOK_TOKEN is not configured");
      return errorResponse(503, "Webhook receiver is not configured");
    }

    let body: string;
    try {
      body = await readBodyWithLimit(
        request,
        dependencies.maxBodyBytes ?? WAHOO_WEBHOOK_MAX_BODY_BYTES,
      );
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        return errorResponse(413, "Webhook payload is too large");
      }

      return errorResponse(400, "Webhook body could not be read");
    }

    const signature = request.headers.get("X-Wahoo-Signature");
    if (signature && !verifyWahooWebhookSignature(body, signature, token)) {
      return errorResponse(401, "Invalid webhook signature");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return errorResponse(400, "Webhook payload must be valid JSON");
    }

    if (!isWebhookPayload(payload)) {
      return errorResponse(400, "Invalid webhook payload");
    }

    if (!secretsMatch(payload.webhook_token, token)) {
      return errorResponse(401, "Invalid webhook token");
    }

    try {
      const { webhook_token: _webhookToken, ...receiptPayload } = payload;
      await dependencies.storeAndEnqueueReceipt(receiptPayload);
      return Response.json({ received: true }, { status: 200 });
    } catch (error) {
      console.error("Failed to persist Wahoo webhook receipt", {
        errorName: error instanceof Error ? error.name : "unknown",
      });
      return errorResponse(503, "Webhook receipt could not be persisted");
    }
  };
}
