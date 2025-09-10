import { NextRequest, NextResponse } from 'next/server'
import { ZodError, ZodSchema } from 'zod'

// Extract user information from middleware headers
export function getUserFromHeaders(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  const userEmail = request.headers.get('x-user-email')
  const userMetadata = request.headers.get('x-user-metadata')

  if (!userId || !userEmail) {
    throw new Error('User information not found in request headers')
  }

  return {
    id: userId,
    email: userEmail,
    metadata: userMetadata ? JSON.parse(userMetadata) : null,
  }
}

// Validate request body with Zod schema
export async function validateRequest<T>(
  request: NextRequest,
  schema: ZodSchema<T>
): Promise<T> {
  try {
    const body = await request.json()
    return schema.parse(body)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError('Invalid request data', error.errors)
    }
    throw error
  }
}

// Custom error classes
export class ValidationError extends Error {
  constructor(message: string, public details: any) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

// Error response helper
export function handleApiError(error: unknown): NextResponse {
  console.error('API Error:', error)

  if (error instanceof ValidationError) {
    return NextResponse.json(
      {
        error: error.message,
        details: error.details
      },
      { status: 400 }
    )
  }

  if (error instanceof NotFoundError) {
    return NextResponse.json(
      { error: error.message },
      { status: 404 }
    )
  }

  if (error instanceof UnauthorizedError) {
    return NextResponse.json(
      { error: error.message },
      { status: 403 }
    )
  }

  // Generic error
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  )
}

// Success response helper
export function successResponse<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json({
    success: true,
    data
  }, { status })
}

// Pagination helper
export function parsePagination(searchParams: URLSearchParams) {
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
  const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0)

  return { limit, offset }
}
