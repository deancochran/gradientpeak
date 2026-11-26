import crypto from "node:crypto";

export class ProviderWebhookPayloadTooLargeError extends Error {}

export type ContentLengthPolicy = "reject-malformed" | "ignore-malformed";

type ReadProviderWebhookBodyOptions = {
  maxBodyBytes: number;
  contentLengthPolicy: ContentLengthPolicy;
};

function declaredBodyIsTooLarge(
  contentLength: string | null,
  maxBodyBytes: number,
  policy: ContentLengthPolicy,
): boolean {
  if (contentLength === null) return false;

  if (policy === "reject-malformed") {
    const normalized = contentLength.trim();
    if (!/^\d+$/.test(normalized)) throw new Error("invalid_content_length");
    return Number(normalized) > maxBodyBytes;
  }

  return Number(contentLength) > maxBodyBytes;
}

/**
 * Reads raw webhook text with a byte limit. `reject-malformed` preserves
 * providers that reject invalid Content-Length values; `ignore-malformed`
 * preserves providers that rely on measured stream bytes instead.
 */
export async function readProviderWebhookBody(
  request: Request,
  { maxBodyBytes, contentLengthPolicy }: ReadProviderWebhookBodyOptions,
): Promise<string> {
  try {
    if (
      declaredBodyIsTooLarge(
        request.headers.get("content-length"),
        maxBodyBytes,
        contentLengthPolicy,
      )
    ) {
      throw new ProviderWebhookPayloadTooLargeError();
    }
  } catch (error) {
    // Rejecting headers must also stop an unread inbound body producer.
    await request.body?.cancel(error).catch(() => undefined);
    throw error;
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let body = "";
  let bytesRead = 0;
  let finished = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        break;
      }

      bytesRead += value.byteLength;
      if (bytesRead > maxBodyBytes) throw new ProviderWebhookPayloadTooLargeError();
      body += decoder.decode(value, { stream: true });
    }

    return body + decoder.decode();
  } catch (error) {
    if (!finished) await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function providerWebhookSecretsMatch(received: string, expected: string): boolean {
  const receivedDigest = crypto.createHash("sha256").update(received, "utf8").digest();
  const expectedDigest = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(receivedDigest, expectedDigest);
}
