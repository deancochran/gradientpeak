// Client-side only exports - safe for browser bundling
export {
  createQueryClient,
  invalidateQueries,
  invalidateSchedulingQueries,
  isSchedulingSensitiveQueryKey,
  queryKeys,
  SCHEDULING_REFRESH_CONTRACT,
  updateQueryData,
} from "./query-client";
export type { AppRouter } from "./routers";
export type { SchedulingRefreshScope } from "./query-client";
