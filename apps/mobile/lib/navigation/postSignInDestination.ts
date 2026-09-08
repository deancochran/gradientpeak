export type PostSignInDestination = "/integrations" | "/training-preferences";

const POST_SIGN_IN_DESTINATIONS = new Set<string>(["/integrations", "/training-preferences"]);

export function parsePostSignInDestination(
  value: string | string[] | undefined,
): PostSignInDestination | null {
  if (typeof value !== "string" || !POST_SIGN_IN_DESTINATIONS.has(value)) return null;
  return value as PostSignInDestination;
}
