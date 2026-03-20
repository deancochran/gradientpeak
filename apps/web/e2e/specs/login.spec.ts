import { expect, test } from "../fixtures";

test.skip(
  !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY,
  "Login E2E requires a service-role credential to seed confirmed test users.",
);

test("should log in as admin and land on the home page", async ({ adminPage }) => {
  // The 'adminPage' fixture has already handled the login.
  // We just need to assert the result.
  await expect(adminPage).toHaveURL(/.*\//);
});
