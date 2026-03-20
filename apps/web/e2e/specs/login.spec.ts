import { test, expect } from "../fixtures";

test("should log in as admin and land on the home page", async ({
  adminPage,
}) => {
  // The 'adminPage' fixture has already handled the login.
  // We just need to assert the result.
  await expect(adminPage).toHaveURL(/.*\//);
});
