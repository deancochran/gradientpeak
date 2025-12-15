import { useAuthStore } from "@/lib/stores/auth-store";

export const getAuthHeaders = () => {
  const session = useAuthStore.getState().session;
  const headers = new Headers();

  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return headers;
};
