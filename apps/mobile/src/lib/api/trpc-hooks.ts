/**
 * @deprecated This file is now replaced by direct tRPC React Query usage.
 * Import { trpc } from '@/lib/trpc' and use trpc.procedureName.useQuery/useMutation directly.
 *
 * Migration examples:
 * - Old: useProfile()
 * - New: trpc.profiles.get.useQuery()
 *
 * - Old: useSignIn()
 * - New: trpc.auth.signInWithPassword.useMutation()
 */

import { trpc } from "../trpc";

// Re-export the trpc object for backward compatibility during migration
export { trpc };

// Legacy hook aliases - will be removed in future version
export const useProfile = () => trpc.profiles.get.useQuery();
export const useSignIn = () => trpc.auth.signInWithPassword.useMutation();
export const useSignUp = () => trpc.auth.signUp.useMutation();
export const useSignOut = () => trpc.auth.signOut.useMutation();
export const useResetPassword = () =>
  trpc.auth.sendPasswordResetEmail.useMutation();
export const useActivities = (params?: any) =>
  trpc.activities.list.useQuery(params || {});
export const useActivity = (id: string) =>
  trpc.activities.get.useQuery({ id }, { enabled: !!id });
export const useCreateActivity = () => trpc.activities.create.useMutation();
export const useUpdateActivity = () => trpc.activities.update.useMutation();
export const useDeleteActivity = () => trpc.activities.delete.useMutation();
export const useSyncActivity = () => trpc.activities.sync.useMutation();
export const useBulkSyncActivities = () =>
  trpc.activities.bulkSync.useMutation();
export const useSyncStatus = () => trpc.sync.status.useQuery();
export const useSyncConflicts = () => trpc.sync.conflicts.useQuery();
export const useResolveConflict = () => trpc.sync.resolveConflict.useMutation();
export const useUpdateProfile = () => trpc.profiles.update.useMutation();
export const useTrainingZones = () => trpc.profiles.getZones.useQuery();
export const useUpdateTrainingZones = () =>
  trpc.profiles.updateZones.useMutation();
export const useProfileStats = (period: number = 30) =>
  trpc.profiles.getStats.useQuery({ period });
export const useTrainingLoadAnalysis = (params?: any) =>
  trpc.analytics.trainingLoad.useQuery(params || {});
export const usePerformanceTrends = (params?: any) =>
  trpc.analytics.performanceTrends.useQuery(params || {});
