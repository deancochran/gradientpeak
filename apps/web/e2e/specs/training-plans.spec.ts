import { expect, test } from "../fixtures";
import {
  expectTrainingPlanLibraries,
  saveAndRestoreMaxSessionsPreference,
} from "../training-plans/journeys";

test.skip(
  !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY,
  "training-plan E2E requires a service-role credential for the confirmed athlete fixture",
);

test("athlete can browse owned and template training-plan libraries", async ({ athletePage }) => {
  await athletePage.goto("/training-plans");
  await expectTrainingPlanLibraries(athletePage);
  await expect(athletePage.getByRole("button", { name: "Create training plan" })).toBeVisible();
});

test("athlete preferences hydrate, validate, persist, and survive reload", async ({
  athletePage,
}) => {
  await saveAndRestoreMaxSessionsPreference(athletePage);
});

test("training-plan create and reorder journeys expose durable controls and states", async ({
  athletePage,
}) => {
  await athletePage.goto("/training-plans/create");
  await expect(athletePage.getByRole("heading", { name: "Create training plan" })).toBeVisible();
  await expect(athletePage.getByRole("heading", { name: "Preview" })).toBeVisible();
  await expect(athletePage.getByRole("button", { name: "Create plan" })).toBeDisabled();

  await athletePage.goto("/training-plans/reorder");
  await expect(
    athletePage.getByRole("heading", { name: "Reorder training plan workouts" }),
  ).toBeVisible();
  await expect(athletePage.getByRole("button", { name: /save order|retry save/i })).toBeDisabled();
});
