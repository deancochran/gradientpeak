export const cardFixtures = {
  profile: {
    accessibilityLabel: "Profile summary",
    role: "article",
    testId: "profile-card",
    title: "Profile",
  },
  recoveryCheck: {
    description:
      "Track energy, sleep quality, and workout confidence before your next block.",
    primaryActionLabel: "Save check-in",
    stats: [
      { label: "Sleep score", value: "8.4 / 10" },
      { label: "Resting HR", value: "52 bpm" },
    ],
    title: "Weekly recovery check",
  },
} as const;
