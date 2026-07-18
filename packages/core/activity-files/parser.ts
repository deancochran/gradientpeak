/**
 * Runtime-heavy activity-file parsing entrypoint.
 *
 * Import this module explicitly when parsing FIT, TCX, or GPX bytes. It is kept
 * out of the package root and contract-only `activity-files` entrypoint so
 * consumers do not load parser dependencies accidentally.
 */
export * from "./activity-file-parser";
