import { useAuthStore } from "@/lib/stores/auth-store";

export const getAuthHeaders = () => {
  const session = useAuthStore.getState().session;
  const headers = new Headers();

  if (session?.bearerToken) {
    headers.set("Authorization", `Bearer ${session.bearerToken}`);
  }

  return headers;
};
