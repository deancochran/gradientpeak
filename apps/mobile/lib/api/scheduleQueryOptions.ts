// Schedule-sensitive screens already get special freshness handling from the
// shared query client. Keep this helper as an opt-in marker without forcing
// every route entry to behave like a cold load.
export const scheduleAwareReadQueryOptions = {};
