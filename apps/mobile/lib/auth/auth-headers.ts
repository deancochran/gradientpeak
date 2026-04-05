import { authClient } from "@/lib/auth/client";
import { useAuthStore } from "@/lib/stores/auth-store";

export const getSessionAuthHeaders = () => {
  const session = useAuthStore.getState().session;
  const headers = new Headers();
  const cookie = (authClient as { getCookie?: () => string }).getCookie?.();

  if (cookie) {
    headers.set("cookie", cookie);
  }

  if (session?.bearerToken) {
    headers.set("Authorization", `Bearer ${session.bearerToken}`);
  }

  return headers;
};
