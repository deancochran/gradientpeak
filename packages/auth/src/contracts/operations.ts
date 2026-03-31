import { z } from "zod";

import { accountDeletionResultSchema } from "./account-deletion";
import { authSessionSchema, authUserSchema } from "./session";

export const signUpInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  emailRedirectTo: z.string().url().optional(),
});

export const signInEmailInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const sendPasswordResetInputSchema = z.object({
  email: z.string().email(),
  redirectTo: z.string().url(),
});

export const updatePasswordInputSchema = z.object({
  email: z.string().email().optional(),
  currentPassword: z.string().min(6).optional(),
  newPassword: z.string().min(6),
});

export const updateEmailInputSchema = z.object({
  currentEmail: z.string().email(),
  newEmail: z.string().email(),
  password: z.string().min(6),
  emailRedirectTo: z.string().url().optional(),
});

export const resendVerificationInputSchema = z.object({
  email: z.string().email(),
  emailRedirectTo: z.string().url().optional(),
});

export const verifyEmailInputSchema = z.object({
  type: z.string().min(1),
  tokenHash: z.string().min(1),
});

export const deleteAccountInputSchema = z.object({
  userId: z.string().min(1),
});

export const authMutationResultSchema = z.object({
  user: authUserSchema.nullable().optional(),
  session: authSessionSchema.nullable().optional(),
  success: z.boolean().default(true),
  message: z.string().optional(),
});

export interface AuthOperations {
  signUp(
    input: z.infer<typeof signUpInputSchema>,
  ): Promise<z.infer<typeof authMutationResultSchema>>;
  signInEmail(
    input: z.infer<typeof signInEmailInputSchema>,
  ): Promise<z.infer<typeof authMutationResultSchema>>;
  signOut(): Promise<{ success: true }>;
  sendPasswordReset(
    input: z.infer<typeof sendPasswordResetInputSchema>,
  ): Promise<{ success: true }>;
  updatePassword(input: z.infer<typeof updatePasswordInputSchema>): Promise<{ success: true }>;
  updateEmail(
    input: z.infer<typeof updateEmailInputSchema>,
  ): Promise<z.infer<typeof authMutationResultSchema>>;
  resendVerification(
    input: z.infer<typeof resendVerificationInputSchema>,
  ): Promise<{ success: true }>;
  verifyEmail(input: z.infer<typeof verifyEmailInputSchema>): Promise<{ success: true }>;
  deleteAccount(
    input: z.infer<typeof deleteAccountInputSchema>,
  ): Promise<z.infer<typeof accountDeletionResultSchema>>;
}

export type SignUpInput = z.infer<typeof signUpInputSchema>;
export type SignInEmailInput = z.infer<typeof signInEmailInputSchema>;
export type SendPasswordResetInput = z.infer<typeof sendPasswordResetInputSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordInputSchema>;
export type UpdateEmailInput = z.infer<typeof updateEmailInputSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationInputSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailInputSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountInputSchema>;
export type AuthMutationResult = z.infer<typeof authMutationResultSchema>;
