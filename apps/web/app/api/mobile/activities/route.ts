import { getUserFromHeaders, handleApiError, parsePagination, successResponse, validateRequest } from '@/lib/api-utils'
import { createActivity, getActivitiesByProfile } from '@repo/drizzle/queries'
import { NextRequest } from 'next/server'
import { z } from 'zod'

const CreateActivitySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  sport: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  duration: z.number().positive().optional(),
  distance: z.number().nonnegative().optional(),
  elevationGain: z.number().nonnegative().optional(),
  calories: z.number().nonnegative().optional(),
  avgHeartRate: z.number().positive().optional(),
  maxHeartRate: z.number().positive().optional(),
  avgPower: z.number().nonnegative().optional(),
  maxPower: z.number().nonnegative().optional(),
  avgCadence: z.number().nonnegative().optional(),
  tss: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  localStoragePath: z.string().optional(),
  syncStatus: z.enum(['local_only', 'syncing', 'synced', 'sync_failed']).default('local_only')
})

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request)
    const { searchParams } = new URL(request.url)
    const { limit, offset } = parsePagination(searchParams)

    // Optional filters
    const sport = searchParams.get('sport')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    console.log('Fetching activities for user:', user.id, { limit, offset, sport, startDate, endDate })

    const activities = await getActivitiesByProfile(user.id, limit, offset)

    return successResponse({
      activities,
      pagination: {
        limit,
        offset,
        total: activities.length
      }
    })
  } catch (error) {
    console.error('Error fetching activities:', error)
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request)
    const activityData = await validateRequest(request, CreateActivitySchema)

    console.log('Creating activity for user:', user.id, activityData.id)

    // Add user ID to activity data
    const activityWithUser = {
      ...activityData,
      profileId: user.id,
      startedAt: new Date(activityData.startedAt),
      completedAt: activityData.completedAt ? new Date(activityData.completedAt) : null
    }

    const activity = await createActivity(activityWithUser)

    console.log('Activity created successfully:', activity.id)

    return successResponse(activity, 201)
  } catch (error) {
    console.error('Error creating activity:', error)
    return handleApiError(error)
  }
}
