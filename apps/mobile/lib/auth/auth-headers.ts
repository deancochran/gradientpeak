import { authClient } from "@/lib/auth/client";
import { useAuthStore } from "@/lib/stores/auth-store";

export const getSessionAuthHeaders = async () => {
  const session = useAuthStore.getState().session;
  const headers = new Headers();
  const cookie = await authClient.getCookie();

  if (cookie) {
    headers.set("cookie", cookie);
  }

  if (session?.bearerToken) {
    headers.set("Authorization", `Bearer ${session.bearerToken}`);
  }

  return headers;
};

export const hasSessionAuthCredentials = () => {
  const session = useAuthStore.getState().session;
  return Boolean(session);
};
