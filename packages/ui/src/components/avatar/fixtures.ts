const avatarMarkup = encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'><rect width='96' height='96' rx='48' fill='%231f2937'/><circle cx='48' cy='36' r='18' fill='%23f9fafb'/><path d='M20 82c6-14 18-22 28-22s22 8 28 22' fill='%23f9fafb'/></svg>",
);

export const avatarFixtures = {
  fallbacks: ["GP", "TM", "AL"] as const,
  profile: {
    alt: "Avery Brooks",
    fallback: "AB",
    imageSrc: `data:image/svg+xml,${avatarMarkup}`,
    testId: "profile-avatar",
  },
} as const;
