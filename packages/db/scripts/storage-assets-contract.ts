export const ROUTE_BUCKET_ID = "gpx-routes";
export const ROUTE_BUCKET_SIZE_LIMIT = "10485760";
export const ROUTE_BUCKET_ALLOWED_MIME_TYPES = [
  "application/gpx+xml",
  "application/vnd.garmin.tcx+xml",
  "application/xml",
] as const;

export interface RouteBucketContractRow {
  id: string;
  public: boolean;
  file_size_limit: string;
  allowed_mime_types: string[] | null;
}

export function assertRouteBucketContract(row: RouteBucketContractRow | undefined): void {
  if (
    !row ||
    row.id !== ROUTE_BUCKET_ID ||
    row.public !== false ||
    row.file_size_limit !== ROUTE_BUCKET_SIZE_LIMIT ||
    JSON.stringify(row.allowed_mime_types) !== JSON.stringify(ROUTE_BUCKET_ALLOWED_MIME_TYPES)
  ) {
    throw new Error(`route storage bucket convergence failed: ${JSON.stringify(row ?? null)}`);
  }
}
