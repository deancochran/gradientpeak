import { useAuthStore } from "@/lib/stores/auth-store";
import { getAuthHeaders } from "./request-auth";

// tRPC calls this at request time, so always resolve Better Auth's current native
// cookie instead of consulting a stale process or SecureStore cache.
export const getSessionAuthHeaders = async () => getAuthHeaders();

export const hasSessionAuthCredentials = () => {
  const session = useAuthStore.getState().session;

  // This synchronous UI gate cannot read Expo SecureStore. The async request
  // header callback remains the authoritative auth transport check.
  return Boolean(session?.user || session?.bearerToken);
};
