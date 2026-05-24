/**
 * Server-only @repo/core exports.
 *
 * These helpers intentionally depend on Node.js APIs or the Garmin FIT SDK and
 * should not be imported by mobile or other strict runtime-neutral consumers.
 * New server consumers should prefer this entrypoint over legacy root exports.
 */

export * from "../activity-files/activity-file-parser";
export * from "../lib/fit-sdk-parser";
export * from "../utils/streamDecompression";
