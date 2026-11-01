import { useAuthStore } from "@/lib/stores/auth-store";
import { getAuthClient } from "./auth-client";

export type MobileAuthBootstrapSource = "better-auth-expo" | "supabase-bridge";
export type MobileAuthTransport = "cookie" | "bearer";

export async function getAuthHeaders() {
  const headers = new Headers();
  const cookieHeader = await getAuthClient().getCookie();

  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
    return headers;
  }

  const bearerToken = useAuthStore.getState().session?.bearerToken;

  if (bearerToken) {
    headers.set("Authorization", `Bearer ${bearerToken}`);
  }

  return headers;
}

export async function getAuthTransport(): Promise<MobileAuthTransport | null> {
  const cookieHeader = await getAuthClient().getCookie();

  if (cookieHeader) {
    return "cookie";
  }

  return useAuthStore.getState().session?.bearerToken ? "bearer" : null;
}
