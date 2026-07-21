import { createHash } from "node:crypto";

export const AUTH_TOKEN_POLICY = Object.freeze({
  emailVerificationExpiresInSeconds: 15 * 60,
  resetPasswordExpiresInSeconds: 60 * 60,
  revokeSessionsOnPasswordReset: true,
});

export function verificationConsumptionId(token: string) {
  return `email-verification:${createHash("sha256").update(token).digest("hex")}`;
}

export interface VerificationConsumptionStore {
  isConsumed(id: string): Promise<boolean>;
  consume(input: { id: string; expiresAt: Date }): Promise<boolean>;
}

export type VerificationRequestLock = <Result>(
  id: string,
  operation: () => Promise<Result>,
) => Promise<Result>;

type VerificationAdvisoryLockClient = {
  query(query: string, values: string[]): Promise<unknown>;
  release(destroy?: boolean): void;
};

type VerificationAdvisoryLockPool = {
  connect(): Promise<VerificationAdvisoryLockClient>;
};

export function createVerificationAdvisoryLock(
  pool: VerificationAdvisoryLockPool,
): VerificationRequestLock {
  return async (id, operation) => {
    const digest = id.slice("email-verification:".length);
    const lockKey = BigInt.asIntN(64, BigInt(`0x${digest.slice(0, 16)}`)).toString();
    const client = await pool.connect();
    let locked = false;
    let destroyed = false;

    try {
      await client.query("SELECT pg_advisory_lock($1::bigint)", [lockKey]);
      locked = true;
      return await operation();
    } finally {
      if (locked) {
        try {
          await client.query("SELECT pg_advisory_unlock($1::bigint)", [lockKey]);
        } catch {
          // A session-level lock survives until unlock or connection close. Never
          // return a possibly locked connection to the pool, and never replace
          // the verification operation's result or primary error with cleanup.
          destroyed = true;
          client.release(true);
        }
      }

      if (!destroyed) {
        client.release();
      }
    }
  };
}

export class VerificationTokenReplayError extends Error {
  override readonly name = "VerificationTokenReplayError";

  constructor() {
    super("Verification link is invalid or has already been used");
  }
}

export function verificationConsumptionIdFromRequest(request: Request | undefined) {
  if (!request) return null;

  try {
    const url = new URL(request.url);
    if (!/(?:^|\/)verify-email\/?$/.test(url.pathname)) return null;

    const tokens = url.searchParams.getAll("token");
    if (tokens.length !== 1 || !tokens[0]) return null;
    return verificationConsumptionId(tokens[0]);
  } catch {
    return null;
  }
}

export async function withVerificationReplayGuard(
  request: Request,
  store: VerificationConsumptionStore,
  withLock: VerificationRequestLock,
  operation: () => Promise<Response>,
) {
  if (hasMalformedVerificationTokenInput(request)) {
    throw new VerificationTokenReplayError();
  }
  const id = verificationConsumptionIdFromRequest(request);
  if (!id) return operation();

  return withLock(id, async () => {
    if (await store.isConsumed(id)) throw new VerificationTokenReplayError();

    const response = await operation();
    // Better Auth may report an already-verified retry as successful without
    // re-running afterEmailVerification. Heal that partial commit, but deny the
    // healing request so no replay can be mistaken for first-use success.
    if (verificationResponseSucceeded(request, response) && !(await store.isConsumed(id))) {
      await recordVerifiedEmailToken(request, store);
      throw new VerificationTokenReplayError();
    }

    return response;
  });
}

function hasMalformedVerificationTokenInput(request: Request) {
  try {
    const url = new URL(request.url);
    if (!/(?:^|\/)verify-email\/?$/.test(url.pathname)) return false;
    const tokens = url.searchParams.getAll("token");
    return tokens.length !== 1 || !tokens[0];
  } catch {
    return true;
  }
}

function verificationResponseSucceeded(request: Request, response: Response) {
  if (response.status >= 200 && response.status < 300) return true;
  if (response.status < 300 || response.status >= 400) return false;

  const location = response.headers.get("location");
  if (!location) return false;

  try {
    const redirect = new URL(location, request.url);
    const errorParameters = ["error", "error_code", "error_description"];
    return (
      !errorParameters.some((parameter) => redirect.searchParams.has(parameter)) &&
      !/(?:^|\/)auth\/error\/?$/.test(redirect.pathname)
    );
  } catch {
    return false;
  }
}

export async function recordVerifiedEmailToken(
  request: Request | undefined,
  store: VerificationConsumptionStore,
  now = new Date(),
) {
  const id = verificationConsumptionIdFromRequest(request);
  if (!id) throw new VerificationTokenReplayError();

  const consumed = await store.consume({
    id,
    // The JWT is already invalid after 15 minutes. Retaining the digest longer
    // keeps replay denial stable across clock skew and delayed duplicate delivery.
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  });
  if (!consumed) throw new VerificationTokenReplayError();
}
