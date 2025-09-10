import { handleApiError, successResponse, validateRequest } from '@/lib/api-utils'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'
import { z } from 'zod'

const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
})

export async function POST(request: NextRequest) {
  try {
    const { refreshToken } = await validateRequest(request, RefreshTokenSchema)

    const supabase = await createClient()
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken
    })

    if (error || !data.session) {
      return handleApiError(new Error('Failed to refresh token'))
    }

    return successResponse({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      user: data.session.user
    })
  } catch (error) {
    return handleApiError(error)
  }
}
