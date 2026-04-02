export const integrationProviders = [
  "strava",
  "wahoo",
  "trainingpeaks",
  "garmin",
  "zwift",
] as const;

export type IntegrationProvider = (typeof integrationProviders)[number];
