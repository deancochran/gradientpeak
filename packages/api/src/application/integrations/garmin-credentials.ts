import { GarminOAuthError, refreshGarminAccessToken } from "../../lib/integrations/garmin/oauth";
import type { createGarminCredentialRepository } from "../../repositories/garmin-credential-repository";

export class GarminCredentialRecoveryError extends Error {
  constructor(public readonly disposition: string) {
    super(
      disposition === "busy" || disposition === "retry"
        ? "Garmin authorization is unavailable; retry shortly."
        : disposition === "disconnect_pending"
          ? "Garmin disconnect needs attention. Revoke GradientPeak in Garmin Connect; remote removal must be confirmed before local cleanup."
          : "Garmin authorization could not be refreshed safely; reconnect Garmin.",
    );
    this.name = "GarminCredentialRecoveryError";
  }
}

export async function resolveGarminCredentials(input: {
  profileId: string;
  repository: ReturnType<typeof createGarminCredentialRepository>;
  refresh?: typeof refreshGarminAccessToken;
}): Promise<string> {
  const acquired = await input.repository.claim(input.profileId);
  if (acquired.kind === "ready") return acquired.accessToken;
  if (acquired.kind !== "refresh") throw new GarminCredentialRecoveryError(acquired.kind);
  const started = Date.now();
  let tokens: Awaited<ReturnType<typeof refreshGarminAccessToken>>;
  try {
    tokens = await (input.refresh ?? refreshGarminAccessToken)(acquired.claim.refreshToken);
  } catch (error) {
    // A definite rejected request may be retried. Lost/invalid responses might have
    // consumed the rotating token; never automatically redeem that token again.
    const definitelyRejected =
      error instanceof GarminOAuthError &&
      ["invalid_client", "invalid_request", "http_429", "configuration_unavailable"].includes(
        error.reason,
      );
    const saved = await input.repository.finish(acquired.claim, {
      kind: "failed",
      reconnect: !definitelyRejected,
    });
    throw new GarminCredentialRecoveryError(
      !saved || definitelyRejected
        ? "retry"
        : acquired.claim.disconnectPending
          ? "disconnect_pending"
          : "reconnect_required",
    );
  }
  const saved = await input.repository.finish(acquired.claim, {
    kind: "success",
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(started + tokens.expires_in * 1_000),
  });
  if (!saved) throw new GarminCredentialRecoveryError("retry");
  return tokens.access_token;
}
