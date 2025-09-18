"use client";

/**
 * tRPC hooks for web app
 * Client-side hooks using the tRPC client
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "./index";

// Auth hooks
export const useSignIn = () => {
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      trpc.auth.signInWithPassword.mutate({ email, password }),
    onSuccess: () => {
      // Invalidate user queries on successful sign in
      const queryClient = useQueryClient();
      queryClient.invalidateQueries();
    },
  });
};

export const useSignUp = () => {
  return useMutation({
    mutationFn: ({
      email,
      password,
      metadata
    }: {
      email: string;
      password: string;
      metadata?: Record<string, any>
    }) =>
      trpc.auth.signUp.mutate({ email, password, metadata }),
  });
};

export const useSignOut = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => trpc.auth.signOut.mutate(),
    onSuccess: () => {
      // Clear all queries on sign out
      queryClient.clear();
    },
  });
};

export const useResetPassword = () => {
  return useMutation({
    mutationFn: ({ email, redirectTo }: { email: string; redirectTo: string }) =>
      trpc.auth.sendPasswordResetEmail.mutate({ email, redirectTo }),
  });
};

export const useUpdatePassword = () => {
  return useMutation({
    mutationFn: ({ newPassword }: { newPassword: string }) =>
      trpc.auth.updatePassword.mutate({ newPassword }),
  });
};

export const useCurrentUser = () => {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: () => trpc.auth.getUser.query(),
    retry: false, // Don't retry auth calls automatically
  });
};

// Profile hooks
export const useProfile = () => {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => trpc.profiles.get.query(),
  });
};

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: any) => trpc.profiles.update.mutate(updates),
    onSuccess: (data) => {
      queryClient.setQueryData(['profile'], data);
    },
  });
};

// Activities hooks
export const useActivities = (params?: {
  limit?: number;
  offset?: number;
  activity_type?: string;
  date_range?: {
    start: string;
    end: string;
  };
}) => {
  return useQuery({
    queryKey: ['activities', params],
    queryFn: () => trpc.activities.list.query(params || {}),
  });
};

export const useActivity = (id: string) => {
  return useQuery({
    queryKey: ['activities', id],
    queryFn: () => trpc.activities.get.query({ id }),
    enabled: !!id,
  });
};

// Storage hooks
export const useCreateSignedUploadUrl = () => {
  return useMutation({
    mutationFn: ({ fileName, fileType }: { fileName: string; fileType: string }) =>
      trpc.storage.createSignedUploadUrl.mutate({ fileName, fileType }),
  });
};

export const useGetSignedUrl = () => {
  return useMutation({
    mutationFn: ({ filePath }: { filePath: string }) =>
      trpc.storage.getSignedUrl.query({ filePath }),
  });
};

export const useDeleteFile = () => {
  return useMutation({
    mutationFn: ({ filePath }: { filePath: string }) =>
      trpc.storage.deleteFile.mutate({ filePath }),
  });
};
