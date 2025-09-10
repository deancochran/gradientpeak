import { getUserFromHeaders, handleApiError, successResponse } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { analyzeTrainingLoad, projectCTL } from '@repo/core'
import { activities } from '@repo/drizzle/schemas'
import { and, desc, eq, gte } from 'drizzle-orm'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request)
    const { searchParams } = new URL(request.url)

    // Parameters
    const period = parseInt(searchParams.get('period') || '90') // days
    const projection = parseInt(searchParams.get('projection') || '14') // days to project
    const includeProjection = searchParams.get('includeProjection') === 'true'

    console.log('Fetching training load analysis for user:', user.id, { period, projection, includeProjection })

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - period)

    // Get activities with TSS data
    const activitiesWithTSS = await db
      .select({
        id: activities.id,
        name: activities.name,
        sport: activities.sport,
        startedAt: activities.startedAt,
        tss: activities.tss,
        duration: activities.duration
      })
      .from(activities)
      .where(
        and(
          eq(activities.profileId, user.id),
          gte(activities.startedAt, startDate)
        )
      )
      .orderBy(desc(activities.startedAt))

    // Filter activities that have TSS values
    const validTSSActivities = activitiesWithTSS
      .filter(a => a.tss && a.tss > 0)
      .map(a => ({
        date: a.startedAt.toISOString().split('T')[0],
        tss: a.tss || 0,
        sport: a.sport,
        name: a.name,
        duration: a.duration || 0
      }))

    if (validTSSActivities.length === 0) {
      return successResponse({
        message: 'No activities with TSS data found for the specified period',
        period: {
          days: period,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        },
        trainingLoad: null,
        currentMetrics: {
          ctl: 0,
          atl: 0,
          tsb: 0,
          rampRate: 0
        },
        weeklyTSS: [],
        projection: null
      })
    }

    // Analyze training load
    const trainingLoadAnalysis = analyzeTrainingLoad(validTSSActivities)

    // Group activities by week for weekly TSS chart
    const weeklyTSS = []
    const weekMap = new Map<string, { week: string; tss: number; activities: number }>()

    validTSSActivities.forEach(activity => {
      const activityDate = new Date(activity.date)
      const weekStart = new Date(activityDate)
      weekStart.setDate(weekStart.getDate() - weekStart.getDay()) // Start of week (Sunday)
      const weekKey = weekStart.toISOString().split('T')[0]

      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, { week: weekKey, tss: 0, activities: 0 })
      }

      const weekData = weekMap.get(weekKey)!
      weekData.tss += activity.tss
      weekData.activities += 1
    })

    // Convert to array and sort by date
    const weeklyData = Array.from(weekMap.values()).sort((a, b) => a.week.localeCompare(b.week))

    // Calculate TSS by sport
    const tssBySport = validTSSActivities.reduce((acc, activity) => {
      if (!acc[activity.sport]) {
        acc[activity.sport] = { tss: 0, activities: 0, duration: 0 }
      }
      acc[activity.sport].tss += activity.tss
      acc[activity.sport].activities += 1
      acc[activity.sport].duration += activity.duration
      return acc
    }, {} as Record<string, { tss: number; activities: number; duration: number }>)

    // Calculate projection if requested
    let projectionData = null
    if (includeProjection && trainingLoadAnalysis.currentCTL > 0) {
      try {
        // Project CTL assuming current TSS pattern continues
        const recentWeeklyTSS = weeklyData.slice(-4).map(w => w.tss) // Last 4 weeks
        const avgWeeklyTSS = recentWeeklyTSS.length > 0
          ? recentWeeklyTSS.reduce((sum, tss) => sum + tss, 0) / recentWeeklyTSS.length
          : 0

        const projectedCTL = projectCTL(
          trainingLoadAnalysis.currentCTL,
          avgWeeklyTSS / 7, // Daily average
          projection
        )

        projectionData = {
          days: projection,
          assumedDailyTSS: Math.round(avgWeeklyTSS / 7),
          projectedCTL: Math.round(projectedCTL * 10) / 10,
          ctlChange: Math.round((projectedCTL - trainingLoadAnalysis.currentCTL) * 10) / 10
        }
      } catch (error) {
        console.warn('Failed to calculate CTL projection:', error)
      }
    }

    const response = {
      period: {
        days: period,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      },
      trainingLoad: trainingLoadAnalysis,
      currentMetrics: {
        ctl: Math.round(trainingLoadAnalysis.currentCTL * 10) / 10,
        atl: Math.round(trainingLoadAnalysis.currentATL * 10) / 10,
        tsb: Math.round(trainingLoadAnalysis.currentTSB * 10) / 10,
        rampRate: Math.round(trainingLoadAnalysis.rampRate * 10) / 10,
        form: trainingLoadAnalysis.currentTSB > 10 ? 'fresh' :
              trainingLoadAnalysis.currentTSB < -10 ? 'fatigued' : 'neutral'
      },
      weeklyTSS: weeklyData,
      tssBySport,
      totalActivities: validTSSActivities.length,
      totalTSS: Math.round(validTSSActivities.reduce((sum, a) => sum + a.tss, 0)),
      projection: projectionData
    }

    console.log('Training load analysis completed for user:', user.id)

    return successResponse(response)
  } catch (error) {
    console.error('Error analyzing training load:', error)
    return handleApiError(error)
  }
}
