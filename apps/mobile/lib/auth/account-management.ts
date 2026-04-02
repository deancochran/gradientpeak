import { authClient, getEmailVerificationCallbackUrl } from "@/lib/auth/client";

export async function updateMobileEmail(input: { newEmail: string; password: string }) {
  return authClient.changeEmail({
    newEmail: input.newEmail,
    callbackURL: getEmailVerificationCallbackUrl(),
  });
}
