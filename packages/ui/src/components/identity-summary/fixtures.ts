import type { IdentitySummaryProps } from "./shared";

export const identitySummaryFixtures = {
  assignedAthlete: {
    title: "Avery Carter",
    supporting: "@avery-carter",
  } satisfies IdentitySummaryProps,
  longIdentity: {
    title:
      "An unusually long athlete identity that still remains readable in a narrow summary region",
    supporting: "@avery-carter-with-a-long-username",
  } satisfies IdentitySummaryProps,
};
