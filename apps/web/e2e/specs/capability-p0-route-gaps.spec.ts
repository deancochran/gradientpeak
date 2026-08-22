import { expect, test } from "../fixtures";

test.describe("P0 route attachment boundary", () => {
  test.skip(
    !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY,
    "route capability E2E requires an authenticated athlete",
  );

  test.fail(
    "recording route preview carries the selected route into recording setup",
    async ({ athletePage }) => {
      await athletePage.goto("/record/route-preview/22222222-2222-4222-8222-222222222222");
      await expect(athletePage).toHaveURL(/\/record(?:\?.*)?$/);
      await expect(athletePage.getByText(/route attached|River Loop/i)).toBeVisible();
    },
  );
});
