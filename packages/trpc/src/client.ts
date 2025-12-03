// Client-side only exports - safe for browser bundling
export {
  createQueryClient,
  invalidateQueries,
  queryKeys,
  updateQueryData,
} from "./query-client";
export type { AppRouter } from "./routers";
