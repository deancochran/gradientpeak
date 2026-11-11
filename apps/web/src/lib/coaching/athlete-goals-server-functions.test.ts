import { expect, it } from "vitest";
import { parseCoachAthleteGoalsInput } from "./athlete-goals-server-functions";

const input = {
  athleteProfileId: "22222222-2222-4222-8222-222222222222",
  cursor: "opaque-cursor",
  organizationId: "11111111-1111-4111-8111-111111111111",
};

it("accepts the API continuation as opaque data while bounding it", () => {
  expect(parseCoachAthleteGoalsInput(input)).toEqual(input);
  expect(() => parseCoachAthleteGoalsInput({ ...input, cursor: "x".repeat(65) })).toThrow();
});

it("rejects actor identifiers and other untrusted fields", () => {
  expect(() =>
    parseCoachAthleteGoalsInput({ ...input, actorProfileId: input.athleteProfileId }),
  ).toThrow();
});
