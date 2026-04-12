import { expect, test } from "../fixtures";

test.skip(
  !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY,
  "web smoke E2E requires a service-role credential to seed confirmed test users.",
);

test("athlete can open migrated protected routes", async ({ athletePage }) => {
  await expect(athletePage.getByRole("heading", { name: /welcome back/i })).toBeVisible();

  await athletePage.goto("/settings");
  await expect(athletePage.getByRole("heading", { name: /^settings$/i })).toBeVisible();

  await athletePage.goto("/notifications");
  await expect(athletePage.getByRole("heading", { name: /^notifications$/i })).toBeVisible();

  await athletePage.goto("/messages");
  await expect(athletePage.getByText(/select a conversation to start chatting/i)).toBeVisible();
});

test("athlete can reach the migrated profile routes from the shell", async ({ athletePage }) => {
  await athletePage.getByRole("button", { name: /open user menu/i }).click();
  await athletePage.getByRole("menuitem", { name: /^profile$/i }).click();

  await expect(athletePage).toHaveURL(/\/user\/.+$/);
  await expect(athletePage.getByRole("heading", { level: 1 })).toBeVisible();

  await athletePage.getByRole("link", { name: /followers$/i }).click();
  await expect(athletePage).toHaveURL(/\/followers$/);
  await expect(athletePage.getByText(/followers$/i)).toBeVisible();

  await athletePage.getByRole("button", { name: /^back$/i }).click();
  await athletePage.getByRole("link", { name: /following$/i }).click();
  await expect(athletePage).toHaveURL(/\/following$/);
  await expect(athletePage.getByText(/following$/i)).toBeVisible();
});

test("coach can open the coaching dashboard", async ({ coachPage }) => {
  await coachPage.goto("/coaching");

  await expect(coachPage.getByRole("heading", { name: /coaching dashboard/i })).toBeVisible();
  await expect(coachPage.getByRole("heading", { name: /^roster$/i })).toBeVisible();
});
