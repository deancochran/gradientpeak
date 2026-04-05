import { authClient, getEmailVerificationCallbackUrl } from "@/lib/auth/client";

export async function updateMobileEmail(input: { newEmail: string }) {
  return authClient.changeEmail({
    newEmail: input.newEmail,
    callbackURL: getEmailVerificationCallbackUrl(),
  });
}

export async function updateMobilePassword(input: {
  currentPassword: string;
  newPassword: string;
}) {
  return authClient.changePassword(input);
}

export async function deleteMobileAccount() {
  return authClient.deleteUser({});
}
