import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './node_modules/@repo/drizzle/schemas/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
