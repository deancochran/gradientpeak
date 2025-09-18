import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../index";

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

export const authRouter = createTRPCRouter({
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

  getUser: protectedProcedure.query(async ({ ctx }) => {
    return { user: ctx.user };
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
});
