import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

// Auth-specific schemas (not database tables)
const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  metadata: z
    .object({
      emailRedirectTo: z.string().url().optional(),
    })
    .optional(),
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const sendPasswordResetEmailSchema = z.object({
  email: z.string().email(),
  redirectTo: z.string().url(),
});

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6),
});

const updateEmailSchema = z.object({
  newEmail: z.string().email(),
  password: z.string().min(6), // Require password for re-authentication
});

const resendVerificationEmailSchema = z.object({
  email: z.string().email(),
  redirectTo: z.string().url().optional(),
});

const verifyOtpSchema = z.object({
  type: z.string(),
  token_hash: z.string(),
});

export const authRouter = createTRPCRouter({
  getSession: publicProcedure.query(({ ctx }) => {
    return ctx.session;
  }),
  signUp: publicProcedure
    .input(signUpSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { data, error } = await ctx.supabase.auth.signUp({
          email: input.email,
          password: input.password,
          options: {
            emailRedirectTo: input.metadata?.emailRedirectTo,
          },
        });

        if (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        return { user: data.user, session: data.session };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create user account",
        });
      }
    }),

  signInWithPassword: publicProcedure
    .input(signInSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { data, error } = await ctx.supabase.auth.signInWithPassword({
          email: input.email,
          password: input.password,
        });

        if (error) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: error.message,
          });
        }

        return { user: data.user, session: data.session };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to sign in",
        });
      }
    }),

  signOut: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const { error } = await ctx.supabase.auth.signOut();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return { success: true };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to sign out",
      });
    }
  }),

  getUser: publicProcedure.query(async ({ ctx }) => {
    try {
      const { data, error } = await ctx.supabase.auth.getUser();

      if (error || !data.user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Not authenticated",
        });
      }

      return data.user;
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication failed",
      });
    }
  }),

  sendPasswordResetEmail: publicProcedure
    .input(sendPasswordResetEmailSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { error } = await ctx.supabase.auth.resetPasswordForEmail(
          input.email,
          {
            redirectTo: input.redirectTo,
          },
        );

        if (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send password reset email",
        });
      }
    }),

  updatePassword: protectedProcedure
    .input(updatePasswordSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify current password by re-authenticating
        const { error: signInError } =
          await ctx.supabase.auth.signInWithPassword({
            email: ctx.session.user.email!,
            password: input.currentPassword,
          });

        if (signInError) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Current password is incorrect",
          });
        }

        // Update to new password
        const { error } = await ctx.supabase.auth.updateUser({
          password: input.newPassword,
        });

        if (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update password",
        });
      }
    }),

  updateEmail: protectedProcedure
    .input(updateEmailSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify password by re-authenticating
        const { error: signInError } =
          await ctx.supabase.auth.signInWithPassword({
            email: ctx.session.user.email!,
            password: input.password,
          });

        if (signInError) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Password is incorrect",
          });
        }

        // Update email - Supabase will send verification emails to both old and new
        const { error } = await ctx.supabase.auth.updateUser({
          email: input.newEmail,
        });

        if (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        return {
          success: true,
          message: `Verification emails sent to both ${ctx.session.user.email} and ${input.newEmail}. Please verify both to complete the email change.`,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update email",
        });
      }
    }),

  resendVerificationEmail: publicProcedure
    .input(resendVerificationEmailSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { error } = await ctx.supabase.auth.resend({
          type: "signup",
          email: input.email,
          options: {
            emailRedirectTo: input.redirectTo,
          },
        });

        if (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to resend verification email",
        });
      }
    }),

  verifyOtp: publicProcedure
    .input(verifyOtpSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { error } = await ctx.supabase.auth.verifyOtp({
          type: input.type as any,
          token_hash: input.token_hash,
        });

        if (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to verify OTP",
        });
      }
    }),

  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      // Use the Admin API to delete the user directly
      // This is required because the RPC 'delete_own_account' relies on auth.uid()
      // which is not set when using the Service Role client in tRPC context
      const { error: deleteError } = await ctx.supabase.auth.admin.deleteUser(
        ctx.session.user.id,
      );

      if (deleteError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete account: " + deleteError.message,
        });
      }

      // Sign out the user
      const { error: signOutError } = await ctx.supabase.auth.signOut();

      if (signOutError) {
        // Log but don't fail - account is already deleted
        console.error(
          "Error signing out after account deletion:",
          signOutError,
        );
      }

      return { success: true };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to delete account",
      });
    }
  }),
});
