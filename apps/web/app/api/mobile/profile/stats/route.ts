import { getUserFromHeaders, handleApiError, successResponse } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { analyzeTrainingLoad } from '@repo/core'
import { getActivityCount } from '@repo/drizzle/queries'
import { activities } from '@repo/drizzle/schemas'
import { and, desc, eq, gte } from 'drizzle-orm'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request)
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || '30' // days

    console.log('Fetching profile stats for user:', user.id, 'period:', period)

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - parseInt(period))

    // Get recent activities for the period
    const recentActivities = await db
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.profileId, user.id),
          gte(activities.startedAt, startDate)
        )
      )
      .orderBy(desc(activities.startedAt))
      .limit(100) // Reasonable limit for calculations

    // Get total activity count
    const totalActivities = await getActivityCount(user.id)

    // Calculate basic stats
    const stats = recentActivities.reduce((acc, activity) => {
      acc.totalDistance += activity.distance || 0
      acc.totalDuration += activity.duration || 0
      acc.totalElevationGain += activity.elevationGain || 0
      acc.totalCalories += activity.calories || 0

      if (activity.tss && activity.tss > 0) {
        acc.totalTSS += activity.tss
        acc.tssCount += 1
      }

      // Track sports
      if (!acc.sportCounts[activity.sport]) {
        acc.sportCounts[activity.sport] = 0
      }
      acc.sportCounts[activity.sport] += 1

      return acc
    }, {
      totalDistance: 0,
      totalDuration: 0,
      totalElevationGain: 0,
      totalCalories: 0,
      totalTSS: 0,
      tssCount: 0,
      sportCounts: {} as Record<string, number>
    })

    // Calculate averages
    const activityCount = recentActivities.length
    const avgDistance = activityCount > 0 ? stats.totalDistance / activityCount : 0
    const avgDuration = activityCount > 0 ? stats.totalDuration / activityCount : 0
    const avgTSS = stats.tssCount > 0 ? stats.totalTSS / stats.tssCount : 0

    // Calculate training load for activities with TSS
    let trainingLoadAnalysis = null
    const activitiesWithTSS = recentActivities
      .filter(a => a.tss && a.tss > 0)
      .map(a => ({
        date: a.startedAt.toISOString().split('T')[0],
        tss: a.tss || 0
      }))

    if (activitiesWithTSS.length > 0) {
      try {
        trainingLoadAnalysis = analyzeTrainingLoad(activitiesWithTSS)
      } catch (error) {
        console.warn('Failed to analyze training load:', error)
      }
    }

    // Weekly activity distribution
    const weeklyStats = Array.from({ length: Math.ceil(parseInt(period) / 7) }, (_, weekIndex) => {
      const weekStart = new Date(startDate)
      weekStart.setDate(weekStart.getDate() + (weekIndex * 7))
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)

      const weekActivities = recentActivities.filter(a =>
        a.startedAt >= weekStart && a.startedAt <= weekEnd
      )

      return {
        week: weekIndex + 1,
        startDate: weekStart.toISOString().split('T')[0],
        endDate: weekEnd.toISOString().split('T')[0],
        activityCount: weekActivities.length,
        totalDistance: weekActivities.reduce((sum, a) => sum + (a.distance || 0), 0),
        totalDuration: weekActivities.reduce((sum, a) => sum + (a.duration || 0), 0),
        totalTSS: weekActivities.reduce((sum, a) => sum + (a.tss || 0), 0)
      }
    })

    const response = {
      period: {
        days: parseInt(period),
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      },
      totals: {
        activities: activityCount,
        allTimeActivities: totalActivities,
        distance: Math.round(stats.totalDistance),
        duration: Math.round(stats.totalDuration),
        elevationGain: Math.round(stats.totalElevationGain),
        calories: Math.round(stats.totalCalories),
        tss: Math.round(stats.totalTSS)
      },
      averages: {
        distancePerActivity: Math.round(avgDistance),
        durationPerActivity: Math.round(avgDuration),
        tssPerActivity: Math.round(avgTSS)
      },
      sportDistribution: stats.sportCounts,
      weeklyStats,
      trainingLoad: trainingLoadAnalysis
    }

    console.log('Profile stats calculated successfully for user:', user.id)

    return successResponse(response)
  } catch (error) {
    console.error('Error fetching profile stats:', error)
    return handleApiError(error)
  }
}
