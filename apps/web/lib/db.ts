import * as schema from '@repo/drizzle/schemas'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set')
}

// Disable prefetch as it is not supported for "Transaction" pool mode
const client = postgres(process.env.DATABASE_URL, { prepare: false })
export const db = drizzle(client, { schema })

export type Database = typeof db
export * from '@repo/drizzle'
