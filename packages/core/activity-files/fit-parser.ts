/**
 * Runtime-heavy Garmin FIT decoding entrypoint.
 *
 * This parser is compatible with supported server and mobile runtimes but is
 * intentionally excluded from runtime-neutral Core entrypoints.
 */
export * from "../lib/fit-sdk-parser";
