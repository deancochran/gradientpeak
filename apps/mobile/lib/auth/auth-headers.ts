import { useAuthStore } from "@/lib/stores/auth-store";
import { peekCachedAuthCookieHeader } from "./secure-session-cache";

export const getSessionAuthHeaders = () => {
  const session = useAuthStore.getState().session;
  const headers = new Headers();
  const cookie = peekCachedAuthCookieHeader();

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
  const cookie = peekCachedAuthCookieHeader();

  return Boolean(cookie || session?.bearerToken);
};
