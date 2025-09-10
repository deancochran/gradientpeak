import { getUserFromHeaders, handleApiError, successResponse } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { calculateMovingAverage, calculatePercentageChange } from '@repo/core'
import { activities } from '@repo/drizzle/schemas'
import { and, desc, eq, gte } from 'drizzle-orm'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request)
    const { searchParams } = new URL(request.url)

    // Parameters
    const period = parseInt(searchParams.get('period') || '90') // days
    const sport = searchParams.get('sport') // optional sport filter
    const metric = searchParams.get('metric') || 'all' // power, heartRate, pace, all

    console.log('Fetching performance trends for user:', user.id, { period, sport, metric })

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - period)

    // Build query conditions
    let queryConditions = [
      eq(activities.profileId, user.id),
      gte(activities.startedAt, startDate)
    ]

    if (sport) {
      queryConditions.push(eq(activities.sport, sport))
    }

    // Get activities with performance data
    const performanceActivities = await db
      .select({
        id: activities.id,
        name: activities.name,
        sport: activities.sport,
        startedAt: activities.startedAt,
        duration: activities.duration,
        distance: activities.distance,
        avgHeartRate: activities.avgHeartRate,
        maxHeartRate: activities.maxHeartRate,
        avgPower: activities.avgPower,
        maxPower: activities.maxPower,
        avgCadence: activities.avgCadence,
        tss: activities.tss
      })
      .from(activities)
      .where(and(...queryConditions))
      .orderBy(desc(activities.startedAt))

    if (performanceActivities.length === 0) {
      return successResponse({
        message: 'No activities found for the specified period',
        period: {
          days: period,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        },
        trends: null
      })
    }

    // Calculate weekly aggregations
    const weeklyData = new Map<string, {
      week: string;
      activities: Array<typeof performanceActivities[0]>;
      avgPower: number[];
      avgHeartRate: number[];
      avgPace: number[]; // calculated as duration/distance
      tss: number[];
      duration: number;
      distance: number;
      activityCount: number;
    }>()

    performanceActivities.forEach(activity => {
      const activityDate = new Date(activity.startedAt)
      const weekStart = new Date(activityDate)
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      const weekKey = weekStart.toISOString().split('T')[0]

      if (!weeklyData.has(weekKey)) {
        weeklyData.set(weekKey, {
          week: weekKey,
          activities: [],
          avgPower: [],
          avgHeartRate: [],
          avgPace: [],
          tss: [],
          duration: 0,
          distance: 0,
          activityCount: 0
        })
      }

      const weekData = weeklyData.get(weekKey)!
      weekData.activities.push(activity)
      weekData.activityCount += 1
      weekData.duration += activity.duration || 0
      weekData.distance += activity.distance || 0

      if (activity.avgPower && activity.avgPower > 0) {
        weekData.avgPower.push(activity.avgPower)
      }
      if (activity.avgHeartRate && activity.avgHeartRate > 0) {
        weekData.avgHeartRate.push(activity.avgHeartRate)
      }
      if (activity.tss && activity.tss > 0) {
        weekData.tss.push(activity.tss)
      }
      if (activity.duration && activity.distance && activity.distance > 0) {
        const pace = activity.duration / (activity.distance / 1000) // seconds per km
        if (pace > 0 && pace < 1800) { // reasonable pace (< 30 min/km)
          weekData.avgPace.push(pace)
        }
      }
    })

    // Convert to sorted array
    const weeklyStats = Array.from(weeklyData.entries())
      .map(([week, data]) => ({
        week,
        activityCount: data.activityCount,
        totalDuration: data.duration,
        totalDistance: data.distance,
        avgPower: data.avgPower.length > 0
          ? data.avgPower.reduce((sum, p) => sum + p, 0) / data.avgPower.length
          : null,
        avgHeartRate: data.avgHeartRate.length > 0
          ? data.avgHeartRate.reduce((sum, hr) => sum + hr, 0) / data.avgHeartRate.length
          : null,
        avgPace: data.avgPace.length > 0
          ? data.avgPace.reduce((sum, p) => sum + p, 0) / data.avgPace.length
          : null,
        totalTSS: data.tss.length > 0
          ? data.tss.reduce((sum, tss) => sum + tss, 0)
          : null,
        avgTSS: data.tss.length > 0
          ? data.tss.reduce((sum, tss) => sum + tss, 0) / data.tss.length
          : null
      }))
      .sort((a, b) => a.week.localeCompare(b.week))

    // Calculate trends and moving averages
    const trends: any = {}

    if (metric === 'all' || metric === 'power') {
      const powerValues = weeklyStats
        .filter(w => w.avgPower !== null)
        .map(w => w.avgPower!)

      if (powerValues.length >= 3) {
        const powerMA = calculateMovingAverage(powerValues, 4)
        const powerChange = calculatePercentageChange(powerValues[0], powerValues[powerValues.length - 1])

        trends.power = {
          values: powerValues,
          movingAverage: powerMA,
          overallChange: powerChange,
          currentValue: powerValues[powerValues.length - 1],
          trend: powerChange > 5 ? 'improving' : powerChange < -5 ? 'declining' : 'stable'
        }
      }
    }

    if (metric === 'all' || metric === 'heartRate') {
      const hrValues = weeklyStats
        .filter(w => w.avgHeartRate !== null)
        .map(w => w.avgHeartRate!)

      if (hrValues.length >= 3) {
        const hrMA = calculateMovingAverage(hrValues, 4)
        const hrChange = calculatePercentageChange(hrValues[0], hrValues[hrValues.length - 1])

        trends.heartRate = {
          values: hrValues,
          movingAverage: hrMA,
          overallChange: hrChange,
          currentValue: hrValues[hrValues.length - 1],
          trend: hrChange < -3 ? 'improving' : hrChange > 3 ? 'declining' : 'stable' // Lower HR is better
        }
      }
    }

    if (metric === 'all' || metric === 'pace') {
      const paceValues = weeklyStats
        .filter(w => w.avgPace !== null)
        .map(w => w.avgPace!)

      if (paceValues.length >= 3) {
        const paceMA = calculateMovingAverage(paceValues, 4)
        const paceChange = calculatePercentageChange(paceValues[0], paceValues[paceValues.length - 1])

        trends.pace = {
          values: paceValues,
          movingAverage: paceMA,
          overallChange: paceChange,
          currentValue: paceValues[paceValues.length - 1],
          trend: paceChange < -3 ? 'improving' : paceChange > 3 ? 'declining' : 'stable' // Lower pace is better
        }
      }
    }

    // Calculate overall performance score
    let performanceScore = 0
    let scoreFactors = 0

    if (trends.power?.trend === 'improving') { performanceScore += 1; scoreFactors++ }
    else if (trends.power?.trend === 'declining') { performanceScore -= 1; scoreFactors++ }

    if (trends.heartRate?.trend === 'improving') { performanceScore += 1; scoreFactors++ }
    else if (trends.heartRate?.trend === 'declining') { performanceScore -= 1; scoreFactors++ }

    if (trends.pace?.trend === 'improving') { performanceScore += 1; scoreFactors++ }
    else if (trends.pace?.trend === 'declining') { performanceScore -= 1; scoreFactors++ }

    const overallTrend = scoreFactors === 0 ? 'insufficient_data' :
      performanceScore > 0 ? 'improving' :
      performanceScore < 0 ? 'declining' : 'stable'

    const response = {
      period: {
        days: period,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      },
      sport: sport || 'all',
      metric,
      totalActivities: performanceActivities.length,
      weeklyStats,
      trends,
      overallTrend,
      performanceScore: scoreFactors > 0 ? Math.round((performanceScore / scoreFactors) * 100) : 0,
      insights: generateInsights(trends, overallTrend, performanceActivities.length)
    }

    console.log('Performance trends analysis completed for user:', user.id)

    return successResponse(response)
  } catch (error) {
    console.error('Error analyzing performance trends:', error)
    return handleApiError(error)
  }
}

function generateInsights(trends: any, overallTrend: string, activityCount: number) {
  const insights = []

  if (activityCount < 5) {
    insights.push({
      type: 'info',
      message: `Limited data available (${activityCount} activities). More activities will provide better trend analysis.`
    })
  }

  if (trends.power?.trend === 'improving') {
    insights.push({
      type: 'positive',
      message: `Power is trending upward with ${trends.power.overallChange > 0 ? '+' : ''}${Math.round(trends.power.overallChange)}% change.`
    })
  }

  if (trends.heartRate?.trend === 'improving') {
    insights.push({
      type: 'positive',
      message: `Heart rate efficiency is improving with ${Math.round(Math.abs(trends.heartRate.overallChange))}% reduction.`
    })
  }

  if (trends.pace?.trend === 'improving') {
    insights.push({
      type: 'positive',
      message: `Pace is improving with ${Math.round(Math.abs(trends.pace.overallChange))}% faster times.`
    })
  }

  if (overallTrend === 'declining') {
    insights.push({
      type: 'warning',
      message: 'Performance metrics show a declining trend. Consider reviewing training load and recovery.'
    })
  }

  if (overallTrend === 'improving') {
    insights.push({
      type: 'positive',
      message: 'Great progress! Your performance metrics are trending upward.'
    })
  }

  return insights
}
