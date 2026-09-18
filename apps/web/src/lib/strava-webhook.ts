import crypto from "node:crypto";
import {
  createStravaWebhookDeliveryIdentity,
  parseStravaWebhookPayload,
  type StravaWebhookPayload,
} from "@repo/api/strava-webhook";

export const STRAVA_WEBHOOK_MAX_BODY_BYTES = 16 * 1024;
export const STRAVA_WEBHOOK_MAX_CHALLENGE_BYTES = 512;
const STRAVA_WEBHOOK_MAX_VERIFY_TOKEN_BYTES = 512;

class PayloadTooLargeError extends Error {}

type StravaWebhookDependencies = {
  getSubscriptionId: () => string | undefined;
  getVerifyToken: () => string | undefined;
  isEnabled: () => boolean;
  maxBodyBytes?: number;
  storeAndEnqueueReceipt: (payload: StravaWebhookPayload, deliveryId: string) => Promise<unknown>;
};

function errorResponse(status: number, error: string) {
  return Response.json(
    { error, received: false },
    { status, ...(status === 503 ? { headers: { "Retry-After": "60" } } : {}) },
  );
}

function secretsMatch(received: string, expected: string): boolean {
  const receivedDigest = crypto.createHash("sha256").update(received, "utf8").digest();
  const expectedDigest = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(receivedDigest, expectedDigest);
}

function isBoundedVerifyToken(value: string): boolean {
  return new TextEncoder().encode(value).byteLength <= STRAVA_WEBHOOK_MAX_VERIFY_TOKEN_BYTES;
}

function configuredSubscriptionId(value: string | undefined): number | null {
  const normalized = value?.trim() ?? "";
  if (!/^[1-9]\d{0,15}$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isJsonContentType(value: string | null): boolean {
  if (!value) return false;
  const [mediaType, ...parameters] = value.split(";");
  if (mediaType?.trim().toLowerCase() !== "application/json") return false;
  return parameters.every((parameter) =>
    /^[\w!#$%&'*+.^`|~-]+\s*=\s*[^;]+$/.test(parameter.trim()),
  );
}

async function readBodyWithLimit(request: Request, limit: number): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^\d+$/.test(declared.trim())) throw new Error("invalid_content_length");
    if (Number(declared) > limit) throw new PayloadTooLargeError();
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let body = "";
  let bytes = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > limit) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    body += decoder.decode(part.value, { stream: true });
  }
  return body + decoder.decode();
}

function validChallenge(value: string | null): value is string {
  if (
    !value ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127;
    })
  )
    return false;
  return new TextEncoder().encode(value).byteLength <= STRAVA_WEBHOOK_MAX_CHALLENGE_BYTES;
}

export function createStravaWebhookHandlers(dependencies: StravaWebhookDependencies) {
  return {
    GET: async (request: Request): Promise<Response> => {
      if (!dependencies.isEnabled()) return errorResponse(404, "Webhook receiver is not available");
      const verifyToken = dependencies.getVerifyToken()?.trim();
      if (!verifyToken || !isBoundedVerifyToken(verifyToken)) {
        return errorResponse(503, "Webhook receiver is not configured");
      }
      const url = new URL(request.url);
      const mode = url.searchParams.get("hub.mode");
      const challenge = url.searchParams.get("hub.challenge");
      const receivedToken = url.searchParams.get("hub.verify_token");
      if (
        mode !== "subscribe" ||
        !validChallenge(challenge) ||
        !receivedToken ||
        !isBoundedVerifyToken(receivedToken) ||
        !secretsMatch(receivedToken, verifyToken)
      ) {
        return errorResponse(403, "Webhook verification failed");
      }
      return Response.json({ "hub.challenge": challenge });
    },

    POST: async (request: Request): Promise<Response> => {
      if (!dependencies.isEnabled()) return errorResponse(404, "Webhook receiver is not available");
      const subscriptionId = configuredSubscriptionId(dependencies.getSubscriptionId());
      if (subscriptionId === null) return errorResponse(503, "Webhook receiver is not configured");
      if (!isJsonContentType(request.headers.get("content-type"))) {
        return errorResponse(415, "Webhook content type must be application/json");
      }
      let body: string;
      try {
        body = await readBodyWithLimit(
          request,
          dependencies.maxBodyBytes ?? STRAVA_WEBHOOK_MAX_BODY_BYTES,
        );
      } catch (error) {
        return error instanceof PayloadTooLargeError
          ? errorResponse(413, "Webhook payload is too large")
          : errorResponse(400, "Webhook body could not be read");
      }
      let value: unknown;
      try {
        value = JSON.parse(body);
      } catch {
        return errorResponse(400, "Webhook payload must be valid JSON");
      }
      const payload = parseStravaWebhookPayload(value);
      if (!payload) return errorResponse(400, "Invalid webhook payload");
      if (payload.subscription_id !== subscriptionId) {
        return errorResponse(403, "Webhook subscription is not recognized");
      }
      try {
        await dependencies.storeAndEnqueueReceipt(
          payload,
          createStravaWebhookDeliveryIdentity(payload),
        );
        return Response.json({ received: true }, { status: 200 });
      } catch (error) {
        console.error("Failed to persist Strava webhook receipt", {
          errorName: error instanceof Error ? error.name : "unknown",
        });
        return errorResponse(503, "Webhook receipt could not be persisted");
      }
    },
  };
}
