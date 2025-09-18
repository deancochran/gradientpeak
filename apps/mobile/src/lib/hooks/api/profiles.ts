import { ProfileService } from "@/lib/services/profile-service";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Centralized query keys prevent typos and simplify cache invalidation
export const profileKeys = {
  all: ["profiles"] as const,
  detail: () => [...profileKeys.all, "detail"] as const,
};

export const useProfile = () => {
  return useQuery({
    queryKey: profileKeys.detail(),
    queryFn: () => ProfileService.getCurrentProfile(),
  });
};

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<SelectProfile>) =>
      ProfileService.updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.detail() });
    },
    onError: (error) => {
      console.error("Failed to update profile", error);
    },
  });
};

export const useCreateProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<SelectProfile>) =>
      ProfileService.createProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.detail() });
    },
    onError: (error) => {
      console.error("Failed to create profile", error);
    },
  });
};
