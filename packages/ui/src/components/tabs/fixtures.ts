export const tabsFixtures = {
  settings: {
    content: {
      notes:
        "Prioritize sleep and avoid stacking strength work the night before the tempo session.",
      overview:
        "Base block is progressing well, with fatigue trending down after the recovery week.",
      profile: "Profile content",
      sessions:
        "Four key sessions are scheduled this week: hills, tempo, recovery spin, and long run.",
    },
    rootTestId: "settings-tabs",
    triggers: {
      notes: {
        label: "Notes",
        testId: "settings-tabs-trigger-notes",
        value: "notes",
      },
      overview: {
        label: "Overview",
        testId: "settings-tabs-trigger-overview",
        value: "overview",
      },
      profile: {
        label: "Profile",
        testId: "settings-tabs-trigger-profile",
        value: "profile",
      },
      sessions: {
        label: "Sessions",
        testId: "settings-tabs-trigger-sessions",
        value: "sessions",
      },
    },
    values: {
      notes: "notes",
      overview: "overview",
      profile: "profile",
      sessions: "sessions",
    },
    contentTestIds: {
      notes: "settings-tabs-content-notes",
      overview: "settings-tabs-content-overview",
      profile: "settings-tabs-content-profile",
      sessions: "settings-tabs-content-sessions",
    },
    listTestId: "settings-tabs-list",
  },
} as const;
