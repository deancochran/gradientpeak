import { z } from "zod";

const emailSchema = z
  .string({ message: "Email is required" })
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email address");

const requiredPasswordSchema = z
  .string({ message: "Password is required" })
  .min(1, "Password is required");

const strongPasswordSchema = z
  .string({ message: "Password is required" })
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const loginFormSchema = z.object({
  email: emailSchema,
  password: requiredPasswordSchema,
});

export const signUpFormSchema = z
  .object({
    email: emailSchema,
    password: strongPasswordSchema,
    repeatPassword: z
      .string({ message: "Please confirm your password" })
      .min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.repeatPassword, {
    message: "Passwords do not match",
    path: ["repeatPassword"],
  });

export const forgotPasswordFormSchema = z.object({
  email: emailSchema,
});

export const updatePasswordFormSchema = z
  .object({
    password: strongPasswordSchema,
    confirmPassword: z
      .string({ message: "Please confirm your password" })
      .min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type LoginFormValues = z.output<typeof loginFormSchema>;
export type SignUpFormValues = z.output<typeof signUpFormSchema>;
export type ForgotPasswordFormValues = z.output<typeof forgotPasswordFormSchema>;
export type UpdatePasswordFormValues = z.output<typeof updatePasswordFormSchema>;
