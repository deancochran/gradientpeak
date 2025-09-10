import { getProfile } from "@lib/services/ProfileService";
import { useQuery } from "@tanstack/react-query";

// Centralized query keys prevent typos and simplify cache invalidation
export const profileKeys = {
  all: ["profiles"] as const,
  detail: () => [...profileKeys.all, "detail"] as const,
};

export const useProfile = () => {
  return useQuery({
    queryKey: profileKeys.detail(),
    queryFn: getProfile,
  });
};
