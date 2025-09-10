import { getUserFromHeaders, handleApiError, successResponse, validateRequest } from '@/lib/api-utils'
import { createProfile, getProfileById, updateProfile } from '@repo/drizzle/queries'
import { NextRequest } from 'next/server'
import { z } from 'zod'

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  dateOfBirth: z.string().datetime().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  heightCm: z.number().min(100).max(250).optional(),
  weightKg: z.number().min(30).max(300).optional(),
  activityLevel: z.enum(['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extremely_active']).optional(),
  fitnessGoals: z.array(z.string()).optional(),
  preferredUnits: z.enum(['metric', 'imperial']).optional(),
  timezone: z.string().optional(),
  maxHeartRate: z.number().min(100).max(250).optional(),
  restingHeartRate: z.number().min(30).max(120).optional(),
  ftpWatts: z.number().min(50).max(500).optional(),
  vo2Max: z.number().min(20).max(80).optional(),
  trainingZonePreference: z.enum(['heart_rate', 'power', 'pace']).optional(),
  privacySettings: z.object({
    profileVisibility: z.enum(['public', 'friends', 'private']).optional(),
    activityVisibility: z.enum(['public', 'friends', 'private']).optional()
  }).optional()
}).partial()

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request)

    console.log('Fetching profile for user:', user.id)

    const profile = await getProfileById(user.id)

    if (!profile) {
      // Create a minimal profile if one doesn't exist
      const newProfile = await createProfile({
        id: user.id,
        email: user.email,
        displayName: user.email.split('@')[0], // Use email prefix as default display name
        preferredUnits: 'metric'
      })

      console.log('Created new profile for user:', user.id)
      return successResponse(newProfile, 201)
    }

    return successResponse(profile)
  } catch (error) {
    console.error('Error fetching profile:', error)
    return handleApiError(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request)
    const updateData = await validateRequest(request, UpdateProfileSchema)

    console.log('Updating profile for user:', user.id, Object.keys(updateData))

    // Ensure profile exists
    let profile = await getProfileById(user.id)

    if (!profile) {
      // Create profile first if it doesn't exist
      profile = await createProfile({
        id: user.id,
        email: user.email,
        displayName: user.email.split('@')[0],
        preferredUnits: 'metric',
        ...updateData
      })

      console.log('Created and updated profile for user:', user.id)
      return successResponse(profile, 201)
    }

    // Update existing profile
    const updatedProfile = await updateProfile(user.id, {
      ...updateData,
      dateOfBirth: updateData.dateOfBirth ? new Date(updateData.dateOfBirth) : undefined
    })

    console.log('Profile updated successfully for user:', user.id)

    return successResponse(updatedProfile)
  } catch (error) {
    console.error('Error updating profile:', error)
    return handleApiError(error)
  }
}
