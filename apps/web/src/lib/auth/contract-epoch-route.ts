import { CONTRACT_EPOCH_HEADER, CURRENT_CONTRACT_EPOCH } from "@repo/api/contract-epoch";

const CURRENT_CONTRACT_EPOCH_HEADER_VALUE = String(CURRENT_CONTRACT_EPOCH);
const AUTH_ROUTE_PREFIX = "/api/auth";

function isExternalSignedAuthGet(request: Request): boolean {
  if (request.method !== "GET") return false;

  const url = new URL(request.url);
  const { pathname } = url;

  // These are issued links, not app-client API calls. Keep this list limited to
  // the Better Auth routes that arrive from email or an identity provider.
  if (pathname === `${AUTH_ROUTE_PREFIX}/verify-email`) {
    return Boolean(url.searchParams.get("token"));
  }

  if (new RegExp(`^${AUTH_ROUTE_PREFIX}/reset-password/[^/]+$`).test(pathname)) {
    return true;
  }

  return new RegExp(`^${AUTH_ROUTE_PREFIX}/callback/[^/]+$`).test(pathname);
}

export function authorizeAuthRouteContractEpoch(request: Request): Response | null {
  if (isExternalSignedAuthGet(request)) return null;

  if (request.headers.get(CONTRACT_EPOCH_HEADER) === CURRENT_CONTRACT_EPOCH_HEADER_VALUE) {
    return null;
  }

  return Response.json({ message: "Client contract epoch is unsupported." }, { status: 412 });
}

export async function runWithAuthorizedAuthRouteContractEpoch<T>(
  request: Request,
  effect: () => Promise<T> | T,
): Promise<T | Response> {
  const rejection = authorizeAuthRouteContractEpoch(request);
  return rejection ?? effect();
}
