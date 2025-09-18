// packages/trpc/src/context.ts
import { createExpoSupabase } from "./utils/supabase/expo";
import { createNextjsClient } from "./utils/supabase/nextjs";

export async function createTRPCContext() {
  const supabase =
    typeof window === "undefined"
      ? await createNextjsClient()
      : createExpoSupabase();

  return {
    supabase,
  };
}
export type Context = Awaited<ReturnType<typeof createTRPCContext>>;
