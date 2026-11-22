export type PostSignInDestination = "/integrations";

const POST_SIGN_IN_DESTINATIONS = new Set<string>(["/integrations"]);

export function parsePostSignInDestination(
  value: string | string[] | undefined,
): PostSignInDestination | null {
  if (typeof value !== "string" || !POST_SIGN_IN_DESTINATIONS.has(value)) return null;
  return value as PostSignInDestination;
}
