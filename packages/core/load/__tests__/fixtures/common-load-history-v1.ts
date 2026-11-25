type SyntheticDailyLoad = {
  date: string;
  load: number;
};

type SyntheticExpectedPoint = {
  date: string;
  dailyLoad: number;
  longTermLoad: number;
  recentLoad: number;
  loadBalance: number;
};

type CommonLoadHistorySyntheticFixture = {
  fixtureVersion: "common_load_history_synthetic_fixture_v1";
  policyVersion: "common_load_history_v1";
  historyCalculation: {
    model: "gradientpeak_common_load_history";
    version: "1";
    asOf: string;
  };
  basis: "completed_activity_history";
  planningTimezone: string;
  currentPlanningDate: string;
  rationale: readonly string[];
  absoluteTolerance: number;
  dailyLoads: readonly SyntheticDailyLoad[];
  expectedPoints: readonly SyntheticExpectedPoint[];
};

/**
 * Literal, reviewable fixture. Expected values were calculated independently
 * from the documented closed-form exponential recurrence, not by production helpers.
 */
export const commonLoadHistoryV1SyntheticFixture = {
  fixtureVersion: "common_load_history_synthetic_fixture_v1",
  policyVersion: "common_load_history_v1",
  historyCalculation: {
    model: "gradientpeak_common_load_history",
    version: "1",
    asOf: "2026-07-21T12:00:00.000Z",
  },
  basis: "completed_activity_history",
  planningTimezone: "America/Los_Angeles",
  currentPlanningDate: "2026-07-21",
  rationale: [
    "Days 1-42 establish an exact zero seed before the first completed-load impulse.",
    "The 84, 42, and 70 point impulses make response and intervening zero-day decay visible.",
    "Expected checkpoints use alpha=1-exp(-1/tau), tau=42 and tau=7, at full precision.",
  ],
  absoluteTolerance: 1e-12,
  dailyLoads: [
    { date: "2026-04-28", load: 0 },
    { date: "2026-04-29", load: 0 },
    { date: "2026-04-30", load: 0 },
    { date: "2026-05-01", load: 0 },
    { date: "2026-05-02", load: 0 },
    { date: "2026-05-03", load: 0 },
    { date: "2026-05-04", load: 0 },
    { date: "2026-05-05", load: 0 },
    { date: "2026-05-06", load: 0 },
    { date: "2026-05-07", load: 0 },
    { date: "2026-05-08", load: 0 },
    { date: "2026-05-09", load: 0 },
    { date: "2026-05-10", load: 0 },
    { date: "2026-05-11", load: 0 },
    { date: "2026-05-12", load: 0 },
    { date: "2026-05-13", load: 0 },
    { date: "2026-05-14", load: 0 },
    { date: "2026-05-15", load: 0 },
    { date: "2026-05-16", load: 0 },
    { date: "2026-05-17", load: 0 },
    { date: "2026-05-18", load: 0 },
    { date: "2026-05-19", load: 0 },
    { date: "2026-05-20", load: 0 },
    { date: "2026-05-21", load: 0 },
    { date: "2026-05-22", load: 0 },
    { date: "2026-05-23", load: 0 },
    { date: "2026-05-24", load: 0 },
    { date: "2026-05-25", load: 0 },
    { date: "2026-05-26", load: 0 },
    { date: "2026-05-27", load: 0 },
    { date: "2026-05-28", load: 0 },
    { date: "2026-05-29", load: 0 },
    { date: "2026-05-30", load: 0 },
    { date: "2026-05-31", load: 0 },
    { date: "2026-06-01", load: 0 },
    { date: "2026-06-02", load: 0 },
    { date: "2026-06-03", load: 0 },
    { date: "2026-06-04", load: 0 },
    { date: "2026-06-05", load: 0 },
    { date: "2026-06-06", load: 0 },
    { date: "2026-06-07", load: 0 },
    { date: "2026-06-08", load: 0 },
    { date: "2026-06-09", load: 84 },
    { date: "2026-06-10", load: 0 },
    { date: "2026-06-11", load: 0 },
    { date: "2026-06-12", load: 0 },
    { date: "2026-06-13", load: 0 },
    { date: "2026-06-14", load: 0 },
    { date: "2026-06-15", load: 0 },
    { date: "2026-06-16", load: 42 },
    { date: "2026-06-17", load: 0 },
    { date: "2026-06-18", load: 0 },
    { date: "2026-06-19", load: 0 },
    { date: "2026-06-20", load: 0 },
    { date: "2026-06-21", load: 0 },
    { date: "2026-06-22", load: 0 },
    { date: "2026-06-23", load: 0 },
    { date: "2026-06-24", load: 0 },
    { date: "2026-06-25", load: 0 },
    { date: "2026-06-26", load: 0 },
    { date: "2026-06-27", load: 0 },
    { date: "2026-06-28", load: 0 },
    { date: "2026-06-29", load: 0 },
    { date: "2026-06-30", load: 0 },
    { date: "2026-07-01", load: 0 },
    { date: "2026-07-02", load: 0 },
    { date: "2026-07-03", load: 0 },
    { date: "2026-07-04", load: 0 },
    { date: "2026-07-05", load: 0 },
    { date: "2026-07-06", load: 0 },
    { date: "2026-07-07", load: 0 },
    { date: "2026-07-08", load: 0 },
    { date: "2026-07-09", load: 0 },
    { date: "2026-07-10", load: 0 },
    { date: "2026-07-11", load: 0 },
    { date: "2026-07-12", load: 0 },
    { date: "2026-07-13", load: 0 },
    { date: "2026-07-14", load: 70 },
    { date: "2026-07-15", load: 0 },
    { date: "2026-07-16", load: 0 },
    { date: "2026-07-17", load: 0 },
    { date: "2026-07-18", load: 0 },
    { date: "2026-07-19", load: 0 },
    { date: "2026-07-20", load: 0 },
  ],
  expectedPoints: [
    { date: "2026-06-08", dailyLoad: 0, longTermLoad: 0, recentLoad: 0, loadBalance: 0 },
    {
      date: "2026-06-09",
      dailyLoad: 84,
      longTermLoad: 1.9763783212115658,
      recentLoad: 11.182256420984746,
      loadBalance: -9.20587809977318,
    },
    {
      date: "2026-06-10",
      dailyLoad: 0,
      longTermLoad: 1.9298774727763865,
      recentLoad: 9.69365096069124,
      loadBalance: -7.763773487914854,
    },
    {
      date: "2026-06-15",
      dailyLoad: 0,
      longTermLoad: 1.7132786882036724,
      recentLoad: 4.745445978462643,
      loadBalance: -3.03216729025897,
    },
    {
      date: "2026-06-16",
      dailyLoad: 42,
      longTermLoad: 2.6611572909813654,
      recentLoad: 9.704850453680015,
      loadBalance: -7.043693162698649,
    },
    {
      date: "2026-07-13",
      dailyLoad: 0,
      longTermLoad: 1.3992046347113536,
      recentLoad: 0.20504679659037972,
      loadBalance: 1.1941578381209739,
    },
    {
      date: "2026-07-14",
      dailyLoad: 70,
      longTermLoad: 3.013265643971203,
      recentLoad: 9.49629755386606,
      loadBalance: -6.483031909894858,
    },
    {
      date: "2026-07-20",
      dailyLoad: 0,
      longTermLoad: 2.6121333928351356,
      recentLoad: 4.029970816329198,
      loadBalance: -1.417837423494062,
    },
  ],
} satisfies CommonLoadHistorySyntheticFixture;
