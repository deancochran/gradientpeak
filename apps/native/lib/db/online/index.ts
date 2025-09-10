/**
 * This file re-exports the shared Drizzle client and schemas for use in the native app.
 * It provides a centralized access point to the online database, ensuring that the app
 * uses the same database instance and type-safe schemas as the rest of the monorepo.
 *
 * @module
 */
export * from "@repo/core";
export * as onlineSchema from "@repo/core/schemas";
