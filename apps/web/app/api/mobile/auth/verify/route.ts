import { getUserFromHeaders, handleApiError, successResponse } from '@/lib/api-utils'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // If we get here, middleware has already verified the token
    const user = getUserFromHeaders(request)

    return successResponse({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
      }
    })
  } catch (error) {
    return handleApiError(error)
  }
}
