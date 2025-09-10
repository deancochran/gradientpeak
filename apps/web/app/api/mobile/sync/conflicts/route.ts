import { getUserFromHeaders, handleApiError, NotFoundError, successResponse, validateRequest } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { getActivityById, updateActivitySync } from '@repo/drizzle/queries'
import { activities } from '@repo/drizzle/schemas'
import { and, eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { z } from 'zod'

const ConflictResolutionSchema = z.object({
  activityId: z.string().uuid(),
  resolution: z.enum(['use_local', 'use_remote', 'merge', 'skip']),
  mergeData: z.object({
    name: z.string().optional(),
    sport: z.string().optional(),
    duration: z.number().optional(),
    distance: z.number().optional(),
    notes: z.string().optional()
  }).optional()
})

const BulkConflictResolutionSchema = z.object({
  conflicts: z.array(ConflictResolutionSchema).min(1).max(20)
})

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request)
    const { searchParams } = new URL(request.url)
    const isBulk = searchParams.get('bulk') === 'true'

    if (isBulk) {
      return await handleBulkConflictResolution(request, user)
    } else {
      return await handleSingleConflictResolution(request, user)
    }
  } catch (error) {
    console.error('Error in conflict resolution:', error)
    return handleApiError(error)
  }
}

async function handleSingleConflictResolution(
  request: NextRequest,
  user: { id: string; email: string }
) {
  const { activityId, resolution, mergeData } = await validateRequest(request, ConflictResolutionSchema)

  console.log('Resolving conflict for activity:', activityId, 'resolution:', resolution)

  // Get the current activity
  const activity = await getActivityById(activityId)

  if (!activity) {
    throw new NotFoundError('Activity not found')
  }

  if (activity.profileId !== user.id) {
    throw new Error('Not authorized to resolve conflict for this activity')
  }

  let resolvedActivity

  switch (resolution) {
    case 'use_local':
      // Keep local data, mark as synced
      resolvedActivity = await updateActivitySync(activityId, 'synced')
      break

    case 'use_remote':
      // This would typically involve fetching remote data and updating local
      // For now, just mark as synced since we don't have remote conflicts in this setup
      resolvedActivity = await updateActivitySync(activityId, 'synced')
      break

    case 'merge':
      // Apply merge data and mark as synced
      if (mergeData) {
        const [updated] = await db
          .update(activities)
          .set({
            ...mergeData,
            syncStatus: 'synced',
            syncError: null,
            updatedAt: new Date()
          })
          .where(and(
            eq(activities.id, activityId),
            eq(activities.profileId, user.id)
          ))
          .returning()

        resolvedActivity = updated
      } else {
        resolvedActivity = await updateActivitySync(activityId, 'synced')
      }
      break

    case 'skip':
      // Mark as sync_failed with a specific message
      const [skipped] = await db
        .update(activities)
        .set({
          syncStatus: 'sync_failed',
          syncError: 'Conflict resolution: skipped by user',
          updatedAt: new Date()
        })
        .where(and(
          eq(activities.id, activityId),
          eq(activities.profileId, user.id)
        ))
        .returning()

      resolvedActivity = skipped
      break

    default:
      throw new Error('Invalid resolution type')
  }

  console.log('Conflict resolved successfully:', activityId, resolution)

  return successResponse({
    success: true,
    activityId,
    resolution,
    activity: resolvedActivity
  })
}

async function handleBulkConflictResolution(
  request: NextRequest,
  user: { id: string; email: string }
) {
  const { conflicts } = await validateRequest(request, BulkConflictResolutionSchema)

  console.log('Resolving bulk conflicts:', conflicts.length, 'for user:', user.id)

  const results = []
  let successCount = 0
  let errorCount = 0

  for (const conflict of conflicts) {
    try {
      const { activityId, resolution, mergeData } = conflict

      // Get the current activity
      const activity = await getActivityById(activityId)

      if (!activity || activity.profileId !== user.id) {
        results.push({
          activityId,
          success: false,
          error: 'Activity not found or unauthorized'
        })
        errorCount++
        continue
      }

      let resolvedActivity

      switch (resolution) {
        case 'use_local':
        case 'use_remote':
          resolvedActivity = await updateActivitySync(activityId, 'synced')
          break

        case 'merge':
          if (mergeData) {
            const [updated] = await db
              .update(activities)
              .set({
                ...mergeData,
                syncStatus: 'synced',
                syncError: null,
                updatedAt: new Date()
              })
              .where(and(
                eq(activities.id, activityId),
                eq(activities.profileId, user.id)
              ))
              .returning()

            resolvedActivity = updated
          } else {
            resolvedActivity = await updateActivitySync(activityId, 'synced')
          }
          break

        case 'skip':
          const [skipped] = await db
            .update(activities)
            .set({
              syncStatus: 'sync_failed',
              syncError: 'Conflict resolution: skipped by user',
              updatedAt: new Date()
            })
            .where(and(
              eq(activities.id, activityId),
              eq(activities.profileId, user.id)
            ))
            .returning()

          resolvedActivity = skipped
          break
      }

      results.push({
        activityId,
        success: true,
        resolution,
        activity: resolvedActivity
      })

      successCount++
    } catch (error) {
      console.error('Error resolving conflict for activity:', conflict.activityId, error)

      results.push({
        activityId: conflict.activityId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      errorCount++
    }
  }

  console.log('Bulk conflict resolution completed:', { successCount, errorCount })

  return successResponse({
    success: true,
    totalConflicts: conflicts.length,
    successCount,
    errorCount,
    results
  })
}

// GET endpoint to detect potential conflicts
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request)

    console.log('Detecting conflicts for user:', user.id)

    // Find activities that might have conflicts
    // In this implementation, we look for activities with sync errors
    const potentialConflicts = await db
      .select({
        id: activities.id,
        name: activities.name,
        sport: activities.sport,
        startedAt: activities.startedAt,
        syncStatus: activities.syncStatus,
        syncError: activities.syncError,
        updatedAt: activities.updatedAt
      })
      .from(activities)
      .where(
        and(
          eq(activities.profileId, user.id),
          eq(activities.syncStatus, 'sync_failed')
        )
      )
      .orderBy(activities.updatedAt)
      .limit(50)

    const conflicts = potentialConflicts.map(activity => ({
      ...activity,
      startedAt: activity.startedAt.toISOString(),
      updatedAt: activity.updatedAt.toISOString(),
      conflictType: 'sync_error', // In a real scenario, this could be 'version_conflict', 'data_mismatch', etc.
      description: activity.syncError || 'Activity failed to sync',
      possibleResolutions: ['retry', 'use_local', 'skip']
    }))

    console.log('Found', conflicts.length, 'potential conflicts for user:', user.id)

    return successResponse({
      conflicts,
      totalCount: conflicts.length,
      hasConflicts: conflicts.length > 0
    })
  } catch (error) {
    console.error('Error detecting conflicts:', error)
    return handleApiError(error)
  }
}
