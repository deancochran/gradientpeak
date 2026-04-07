import { z } from "zod";

export const authEmailSchema = z.string().email("Invalid email address");

export const authPasswordSchema = z
  .string({ message: "Password is required" })
  .min(8, "Password must be at least 8 characters");

export const authStrongPasswordSchema = authPasswordSchema
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const signInSchema = z.object({
  email: authEmailSchema,
  password: authPasswordSchema,
});

export type SignInFields = z.infer<typeof signInSchema>;

export const signUpSchema = z
  .object({
    email: authEmailSchema,
    password: authStrongPasswordSchema,
    repeatPassword: z.string({ message: "Please confirm your password" }),
  })
  .refine((data) => data.password === data.repeatPassword, {
    message: "Passwords do not match",
    path: ["repeatPassword"],
  });

export type SignUpFields = z.infer<typeof signUpSchema>;

export const forgotPasswordSchema = z.object({
  email: authEmailSchema,
});

export type ForgotPasswordFields = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: authStrongPasswordSchema,
    confirmPassword: z.string({ message: "Please confirm your password" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export type ResetPasswordFields = z.infer<typeof resetPasswordSchema>;

export function getDisplayNameFromEmail(email: string) {
  return email.split("@")[0] || email;
}
