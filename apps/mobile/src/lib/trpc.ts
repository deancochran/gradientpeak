import type { AppRouter } from "@repo/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { supabase } from "./supabase";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: process.env.EXPO_PUBLIC_API_URL + "/api/trpc" || "http://localhost:3000/api/trpc",
      headers: async () => {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;

        return {
          authorization: token ? `Bearer ${token}` : "",
        };
      },
    }),
  ],
});
