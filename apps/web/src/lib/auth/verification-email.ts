export function getVerificationEmail(
  email?: string,
  authenticatedEmail?: string,
): string | undefined {
  return authenticatedEmail ?? email;
}
