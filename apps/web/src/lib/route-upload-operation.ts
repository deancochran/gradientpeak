const ROUTE_UPLOAD_OPERATION_PREFIX = "gradientpeak:route-upload:v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function claimRouteUploadOperation(input: {
  description: string | null;
  fileContent: string;
  fileName: string;
  name: string;
  profileId: string;
}) {
  const fingerprintPayload = JSON.stringify([
    input.profileId,
    input.fileName,
    input.name,
    input.description,
    input.fileContent,
  ]);
  const fingerprint = toHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fingerprintPayload)),
  );
  const storageKey = `${ROUTE_UPLOAD_OPERATION_PREFIX}:${input.profileId}:${fingerprint}`;
  const stored = localStorage.getItem(storageKey);
  const idempotencyKey = stored && UUID_PATTERN.test(stored) ? stored : crypto.randomUUID();
  localStorage.setItem(storageKey, idempotencyKey);
  return { idempotencyKey, storageKey };
}

export function clearRouteUploadOperation(storageKey: string) {
  localStorage.removeItem(storageKey);
}
