import { TRPCError } from "@trpc/server";
import type { Context } from "../../context";

type AssertProfileAccessParams = {
  ctx: Context;
  profileId: string;
};

export async function assertProfileAccess({
  ctx,
  profileId,
}: AssertProfileAccessParams): Promise<void> {
  const requesterId = ctx.session?.user?.id;
  const supabase = ctx.supabase as any;

  if (!requesterId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  if (requesterId === profileId) {
    return;
  }

  const { data, error } = await supabase
    .from("coaches_athletes")
    .select("coach_id")
    .eq("coach_id", requesterId)
    .eq("athlete_id", profileId)
    .maybeSingle();

  if (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to verify profile access",
    });
  }

  if (!data) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not authorized to access this profile",
    });
  }
}
