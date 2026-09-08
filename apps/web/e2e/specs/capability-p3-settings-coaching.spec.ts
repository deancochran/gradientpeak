import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";
import type { E2EExecutionIdentity } from "../support/identity";

async function seedCoachOrganization(
  identity: E2EExecutionIdentity,
  rootOwnerId: string,
  coachId: string,
) {
  const organizationId = identity.uuid("coaching-organization");
  const rootMembershipId = identity.uuid("coaching-root-membership");
  const coachMembershipId = identity.uuid("coaching-membership");
  const organizationName = `Playwright Coaching ${organizationId}`;

  await withLocalE2EDatabase(async (database) => {
    await database.transaction(async (query) => {
      await query.query("set constraints all deferred");
      await query.query(
        `insert into "organizations"
        ("id", "created_by_profile_id", "root_owner_membership_id", "name", "slug", "timezone")
       values ($1, $2, $3, $4, $5, 'UTC')`,
        [
          organizationId,
          rootOwnerId,
          rootMembershipId,
          organizationName,
          `playwright-${organizationId}`,
        ],
      );
      await query.query(
        `insert into "organization_memberships" ("id", "organization_id", "profile_id")
       values ($1, $2, $3), ($4, $2, $5)`,
        [rootMembershipId, organizationId, rootOwnerId, coachMembershipId, coachId],
      );
      await query.query(
        `insert into "organization_membership_role_grants"
         ("organization_id", "membership_id", "role_key")
        values ($1, $2, 'admin'), ($1, $3, 'coach')`,
        [organizationId, rootMembershipId, coachMembershipId],
      );
    });
  });
  return {
    organizationId,
    organizationName,
    cleanup: async () => {
      await withLocalE2EDatabase((database) =>
        database.transaction(async (query) => {
          await query.query("set constraints all deferred");
          await query.query(
            `update "organization_membership_role_grants"
             set "revoked_at" = now()
           where "organization_id" = $1 and "membership_id" = $2
             and "role_key" = 'coach' and "revoked_at" is null`,
            [organizationId, coachMembershipId],
          );
        }),
      );
    },
  };
}

test("settings.select-theme persists a chosen theme across reloads", async ({ athletePage }) => {
  await athletePage.goto("/settings");

  const themePreference = athletePage.getByRole("group", { name: "Theme preference" });
  await themePreference.getByRole("button", { name: "dark" }).click();
  await expect(themePreference.getByRole("button", { name: "dark" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await athletePage.reload();
  await expect(
    athletePage.getByRole("group", { name: "Theme preference" }).getByRole("button", {
      name: "dark",
    }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("[P2] profile and privacy settings persist together and can be restored", async ({
  profilePage,
}, testInfo) => {
  await profilePage.goto("/settings");
  const fullName = profilePage.getByLabel("Full name");
  const bio = profilePage.getByLabel("Bio");
  const units = profilePage.getByLabel("Preferred units");
  const language = profilePage.getByLabel("Language");
  const openProfile = profilePage.getByRole("switch", { name: "Open profile" });
  const visibility = profilePage.getByLabel("Default activity visibility");
  const original = {
    bio: await bio.inputValue(),
    fullName: await fullName.inputValue(),
    language: await language.inputValue(),
    open: await openProfile.isChecked(),
    units: await units.inputValue(),
    visibility: await visibility.inputValue(),
  };
  const suffix = testInfo.titlePath.join("-").length.toString(36);

  try {
    await fullName.fill(`Persisted Profile ${suffix}`);
    await bio.fill(`Persisted browser biography ${suffix}`);
    await units.selectOption(original.units === "metric" ? "imperial" : "metric");
    await language.fill("fr");
    if ((await openProfile.isChecked()) === original.open) await openProfile.click();
    await visibility.selectOption(original.visibility === "public" ? "private" : "public");
    await profilePage.getByRole("button", { name: "Update Profile" }).click();
    await expect(
      profilePage.getByText("Profile updated successfully", { exact: true }).last(),
    ).toBeVisible();

    await profilePage.reload();
    await expect(fullName).toHaveValue(`Persisted Profile ${suffix}`);
    await expect(bio).toHaveValue(`Persisted browser biography ${suffix}`);
    await expect(units).toHaveValue(original.units === "metric" ? "imperial" : "metric");
    await expect(language).toHaveValue("fr");
    await expect(openProfile).toBeChecked({ checked: !original.open });
    await expect(visibility).toHaveValue(original.visibility === "public" ? "private" : "public");
  } finally {
    await profilePage.goto("/settings");
    await fullName.fill(original.fullName);
    await bio.fill(original.bio);
    await units.selectOption(original.units);
    await language.fill(original.language);
    if ((await openProfile.isChecked()) !== original.open) await openProfile.click();
    await visibility.selectOption(original.visibility);
    const restoreProfile = profilePage.getByRole("button", { name: "Update Profile" });
    if (await restoreProfile.isEnabled()) {
      await restoreProfile.click();
      await expect(
        profilePage.getByText("Profile updated successfully", { exact: true }).last(),
      ).toBeVisible();
    }
  }
});

test("coaching.view-dashboard opens an authorized organization dashboard", async ({
  athleteActor,
  coachActor,
  coachPage,
  e2eIdentity,
}) => {
  const organization = await seedCoachOrganization(
    e2eIdentity,
    athleteActor.profileId,
    coachActor.profileId,
  );

  try {
    await coachPage.goto("/organizations");
    await coachPage
      .getByRole("link", { name: `Open ${organization.organizationName} coaching dashboard` })
      .click();

    await expect(coachPage).toHaveURL(
      new RegExp(`/organizations/${organization.organizationId}/dashboard$`),
    );
    await expect(coachPage.getByRole("heading", { name: "Coaching workspace" })).toBeVisible();
    await expect(
      coachPage.getByRole("region", { name: "Coaching dashboard readiness" }),
    ).toBeVisible();
    await expect(coachPage.getByText("Profiles", { exact: true })).toBeVisible();
  } finally {
    await organization.cleanup();
  }
});

test("[variation:settings.theme:keyboard] keyboard theme selection persists and restores the original preference", async ({
  athletePage,
}) => {
  await athletePage.goto("/settings");
  const group = athletePage.getByRole("group", { name: "Theme preference" });
  const pressed = group.locator('[aria-pressed="true"]');
  const original = (await pressed.textContent())?.trim().toLowerCase() ?? "system";
  const next = original === "light" ? "dark" : "light";
  try {
    const choice = group.getByRole("button", { name: next });
    await choice.focus();
    await choice.press("Enter");
    await expect(choice).toHaveAttribute("aria-pressed", "true");
    await athletePage.reload();
    await expect(
      athletePage.getByRole("group", { name: "Theme preference" }).getByRole("button", {
        name: next,
      }),
    ).toHaveAttribute("aria-pressed", "true");
  } finally {
    await athletePage
      .getByRole("group", { name: "Theme preference" })
      .getByRole("button", { name: original })
      .click();
  }
});

test("[variation:settings.theme:history] chosen theme remains selected after visiting profile and returning through browser history", async ({
  athletePage,
}) => {
  await athletePage.goto("/settings");
  const group = athletePage.getByRole("group", { name: "Theme preference" });
  const original = (await group.locator('[aria-pressed="true"]').textContent())?.trim() ?? "system";
  const next = original.toLowerCase() === "dark" ? "light" : "dark";
  try {
    await group.getByRole("button", { name: next }).click();
    await athletePage.getByRole("button", { name: /open user menu/i }).click();
    await athletePage.getByRole("menuitem", { name: /^profile$/i }).click();
    await athletePage.goBack();
    await expect(
      athletePage.getByRole("group", { name: "Theme preference" }).getByRole("button", {
        name: next,
      }),
    ).toHaveAttribute("aria-pressed", "true");
  } finally {
    await athletePage
      .getByRole("group", { name: "Theme preference" })
      .getByRole("button", { name: original })
      .click();
  }
});

test("[variation:settings.profile:unsaved-reload] unsaved profile and privacy changes are discarded together on reload", async ({
  profilePage,
}) => {
  await profilePage.goto("/settings");
  const name = profilePage.getByLabel("Full name");
  const visibility = profilePage.getByLabel("Default activity visibility");
  const open = profilePage.getByRole("switch", { name: "Open profile" });
  const originalName = await name.inputValue();
  const originalVisibility = await visibility.inputValue();
  const originalOpen = await open.isChecked();
  await name.fill("Unsaved profile variation");
  await visibility.selectOption(originalVisibility === "public" ? "private" : "public");
  await open.click();
  await profilePage.reload();
  await expect(name).toHaveValue(originalName);
  await expect(visibility).toHaveValue(originalVisibility);
  await expect(open).toBeChecked({ checked: originalOpen });
});

test("[variation:settings.profile:keyboard-save] keyboard save persists profile fields and restores their exact original values", async ({
  profilePage,
}, testInfo) => {
  await profilePage.goto("/settings");
  const name = profilePage.getByLabel("Full name");
  const bio = profilePage.getByLabel("Bio");
  const originalName = await name.inputValue();
  const originalBio = await bio.inputValue();
  const changed = `Keyboard Profile ${testInfo.titlePath.join("-").length}`;
  try {
    await name.fill(changed);
    await bio.fill("Keyboard persisted profile variation");
    await profilePage.getByRole("button", { name: "Update Profile" }).press("Enter");
    await expect(
      profilePage.getByText("Profile updated successfully", { exact: true }).last(),
    ).toBeVisible();
    await profilePage.reload();
    await expect(name).toHaveValue(changed);
    await expect(bio).toHaveValue("Keyboard persisted profile variation");
  } finally {
    await name.fill(originalName);
    await bio.fill(originalBio);
    const restoreProfile = profilePage.getByRole("button", { name: "Update Profile" });
    if (await restoreProfile.isEnabled()) {
      await restoreProfile.click();
      await expect(
        profilePage.getByText("Profile updated successfully", { exact: true }).last(),
      ).toBeVisible();
    }
  }
});

test("[variation:coaching.dashboard:narrow-history] narrow organization card opens coaching readiness and returns through history", async ({
  athleteActor,
  coachActor,
  coachPage,
  e2eIdentity,
}) => {
  const organization = await seedCoachOrganization(
    e2eIdentity,
    athleteActor.profileId,
    coachActor.profileId,
  );
  try {
    await coachPage.setViewportSize({ width: 390, height: 844 });
    await coachPage.goto("/organizations");
    const open = coachPage.getByRole("link", {
      name: `Open ${organization.organizationName} coaching dashboard`,
    });
    await open.scrollIntoViewIfNeeded();
    await open.click();
    await expect(
      coachPage.getByRole("region", { name: "Coaching dashboard readiness" }),
    ).toBeVisible();
    await coachPage.goBack();
    await expect(open).toBeVisible();
    await coachPage.goForward();
    await expect(coachPage.getByRole("heading", { name: "Coaching workspace" })).toBeVisible();
  } finally {
    await organization.cleanup();
  }
});

test("[variation:coaching.dashboard:revoked-role] dashboard access fails closed after the fixture coach role is revoked", async ({
  athleteActor,
  coachActor,
  coachPage,
  e2eIdentity,
}) => {
  const organization = await seedCoachOrganization(
    e2eIdentity,
    athleteActor.profileId,
    coachActor.profileId,
  );
  await coachPage.goto(`/organizations/${organization.organizationId}/dashboard`);
  await expect(coachPage.getByRole("heading", { name: "Coaching workspace" })).toBeVisible();
  await organization.cleanup();
  await coachPage.reload();
  await expect(coachPage.getByRole("heading", { name: /coaching access required/i })).toBeVisible();
  await expect(coachPage.getByRole("region", { name: "Coaching dashboard readiness" })).toHaveCount(
    0,
  );
});
