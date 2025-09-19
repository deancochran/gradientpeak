import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

// Auth-specific schemas (not database tables)
const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  metadata: z.record(z.string(), z.any()).optional(),
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
  newPassword: z.string().min(6),
});

const verifyOtpSchema = z.object({
  type: z.string(),
  token_hash: z.string(),
});

export const authRouter = createTRPCRouter({
  getSession: publicProcedure.query(({ ctx }) => {
    return ctx.session;
  }),
  getSecretMessage: protectedProcedure.query(() => {
    return "you can see this secret message!";
  }),
  signUp: publicProcedure
    .input(signUpSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { data, error } = await ctx.supabase.auth.signUp({
          email: input.email,
          password: input.password,
          options: input.metadata ? { data: input.metadata } : undefined,
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
      // First delete the user profile (will cascade to related data)
      const { error: profileError } = await ctx.supabase
        .from("profiles")
        .delete()
        .eq("id", ctx.session.user.id);

      if (profileError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete profile data",
        });
      }

      // Then delete the auth user
      const { error: authError } = await ctx.supabase.auth.admin.deleteUser(
        ctx.session.user.id,
      );

      if (authError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete user account",
        });
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
