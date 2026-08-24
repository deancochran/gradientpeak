import {
  activityFileForIdentity,
  activityFiles,
  activityFixtureIdentity,
  deleteImportedActivity,
  importActivity,
} from "../activities/fixture-files";
import { expect, test } from "../fixtures";
import { ActivitiesPage } from "../pages";

test("[variation:narrow] filtered activity card opens detail and returns to retained history", async ({
  athletePage,
}, testInfo) => {
  await athletePage.setViewportSize({ width: 390, height: 844 });
  const activities = new ActivitiesPage(athletePage);
  let activityId = "";
  try {
    activityId = await importActivity(
      athletePage,
      activityFiles.gpx,
      activityFixtureIdentity(testInfo, "narrow history"),
    );
    await activities.openLibrary();
    await activities.filter({ category: "run", sort: "distance" });
    const card = activities.activityCard(activityId);
    await expect(card).toBeVisible();
    await activities.openCard(activityId);
    await expect(athletePage.getByRole("heading", { name: "Route preview" })).toBeVisible();
    await athletePage.goBack();
    await expect(athletePage.getByLabel("Activity category")).toHaveValue("run");
    await activities.openCard(activityId);
    await expect(athletePage.getByRole("heading", { name: "Stream charts" })).toBeVisible();
  } finally {
    await deleteImportedActivity(athletePage, activityId);
  }
});

test("[variation:keyboard] visibility menu changes with focused controls and persists on reopen", async ({
  athletePage,
}, testInfo) => {
  let activityId = "";
  const activities = new ActivitiesPage(athletePage);
  try {
    activityId = await importActivity(
      athletePage,
      activityFiles.gpx,
      activityFixtureIdentity(testInfo, "keyboard visibility"),
    );
    const trigger = athletePage.getByRole("button", { name: "Change visibility" });
    await trigger.focus();
    await athletePage.keyboard.press("Enter");
    const publicChoice = athletePage.getByRole("button", { name: /^Public/ });
    await publicChoice.focus();
    await expect(publicChoice).toBeFocused();
    await athletePage.keyboard.press("Enter");
    await expect(athletePage.getByText("Visibility updated")).toBeVisible();
    await activities.openDetail(activityId);
    await trigger.press("Enter");
    await expect(athletePage.getByRole("button", { name: /^Public/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await athletePage.getByRole("button", { name: /^Private/ }).press("Enter");
  } finally {
    await deleteImportedActivity(athletePage, activityId);
  }
});

test("[variation:activities.public-share:history] public detail survives back and forward while private history remains owned", async ({
  athletePage,
  browser,
}, testInfo) => {
  let activityId = "";
  const anonymous = await browser.newPage();
  const activities = new ActivitiesPage(athletePage);
  const publicActivity = new ActivitiesPage(anonymous);
  try {
    activityId = await importActivity(
      athletePage,
      activityFiles.gpx,
      activityFixtureIdentity(testInfo, "anonymous history"),
    );
    await activities.setVisibility("Public");
    await publicActivity.openPublicShare(activityId);
    await expect(anonymous.getByRole("region", { name: "Activity summary" })).toBeVisible();
    await anonymous.goto("/auth/login");
    await anonymous.goBack();
    await expect(anonymous.getByRole("region", { name: "Activity summary" })).toBeVisible();
    await anonymous.goForward();
    await expect(anonymous.getByRole("heading", { name: "Login", exact: true })).toBeVisible();
  } finally {
    await anonymous.close();
    await deleteImportedActivity(athletePage, activityId);
  }
});

test("[variation:activities.public-share:followers-boundary] followers visibility stays unavailable anonymously until a real public change", async ({
  athletePage,
  browser,
}, testInfo) => {
  let activityId = "";
  const anonymous = await browser.newPage();
  const activities = new ActivitiesPage(athletePage);
  const publicActivity = new ActivitiesPage(anonymous);
  try {
    activityId = await importActivity(
      athletePage,
      activityFiles.gpx,
      activityFixtureIdentity(testInfo, "followers boundary"),
    );
    await activities.setVisibility("Followers");
    await publicActivity.openPublicShare(activityId);
    await expect(anonymous.getByText("Page not found", { exact: false })).toBeVisible();
    await activities.setVisibility("Public");
    await anonymous.reload();
    await expect(anonymous.getByRole("region", { name: "Activity summary" })).toBeVisible();
  } finally {
    await anonymous.close();
    await deleteImportedActivity(athletePage, activityId);
  }
});

test("[variation:activities.fit:pool-detail] pool length content remains after detail reload", async ({
  athletePage,
}, testInfo) => {
  let activityId = "";
  try {
    activityId = await importActivity(
      athletePage,
      activityFiles.fit,
      activityFixtureIdentity(testInfo, "FIT pool reload"),
    );
    await expect(athletePage.getByRole("heading", { name: "Pool swim detail" })).toBeVisible();
    await expect(athletePage.getByText("25 meters")).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByRole("heading", { name: "Laps" })).toBeVisible();
    await expect(athletePage.getByText("25 meters")).toBeVisible();
  } finally {
    await deleteImportedActivity(athletePage, activityId);
  }
});

test("[variation:activities.fit:filtered-history] swim filter opens the imported pool activity and returns to retained filtering", async ({
  athletePage,
}, testInfo) => {
  let activityId = "";
  const activities = new ActivitiesPage(athletePage);
  try {
    activityId = await importActivity(
      athletePage,
      activityFiles.fit,
      activityFixtureIdentity(testInfo, "FIT filtered history"),
    );
    await activities.openLibrary();
    await activities.filter({ category: "swim" });
    const card = activities.activityCard(activityId);
    await expect(card).toBeVisible();
    await activities.openCard(activityId);
    await expect(athletePage.getByRole("heading", { name: "Pool swim detail" })).toBeVisible();
    await athletePage.goBack();
    await expect(athletePage.getByLabel("Activity category")).toHaveValue("swim");
    await expect(card).toBeVisible();
  } finally {
    await deleteImportedActivity(athletePage, activityId);
  }
});

test("[variation:activities.tcx:stream-detail] ride stream and route content remain visible across a deep-link reload", async ({
  athletePage,
}, testInfo) => {
  let activityId = "";
  const activities = new ActivitiesPage(athletePage);
  try {
    activityId = await importActivity(
      athletePage,
      activityFiles.tcx,
      activityFixtureIdentity(testInfo, "TCX streams"),
    );
    await expect(athletePage.getByRole("heading", { name: "Route preview" })).toBeVisible();
    await expect(athletePage.getByRole("heading", { name: "Stream charts" })).toBeVisible();
    await activities.openDetail(activityId);
    await expect(athletePage.getByRole("heading", { name: "Stream analysis" })).toBeVisible();
  } finally {
    await deleteImportedActivity(athletePage, activityId);
  }
});

test("[variation:activities.tcx:bike-history] bike sorting opens the exact imported ride and restores list state on back", async ({
  athletePage,
}, testInfo) => {
  let activityId = "";
  const activities = new ActivitiesPage(athletePage);
  try {
    activityId = await importActivity(
      athletePage,
      activityFiles.tcx,
      activityFixtureIdentity(testInfo, "TCX bike history"),
    );
    await activities.openLibrary();
    await activities.filter({ category: "bike", sort: "distance", order: "desc" });
    await activities.openCard(activityId);
    await expect(athletePage.getByRole("heading", { name: "Route preview" })).toBeVisible();
    await athletePage.goBack();
    await expect(athletePage.getByLabel("Activity category")).toHaveValue("bike");
    await expect(athletePage.getByLabel("Sort by")).toHaveValue("distance");
  } finally {
    await deleteImportedActivity(athletePage, activityId);
  }
});

test("[variation:activities.import-retry:keyboard] malformed input is replaced and submitted through the focused import control", async ({
  athletePage,
}, testInfo) => {
  let activityId = "";
  const activities = new ActivitiesPage(athletePage);
  try {
    await activities.openImporter();
    const file = athletePage.getByTestId("activity-import-file-input");
    await activities.selectImportFile({
      name: "keyboard-broken.gpx",
      mimeType: "application/gpx+xml",
      buffer: Buffer.from("<gpx>keyboard-broken"),
    });
    const submit = athletePage.getByRole("button", { name: "Import activity" });
    await submit.focus();
    await submit.press("Enter");
    await expect(athletePage.getByRole("alert")).toBeVisible();
    await file.setInputFiles(
      activityFileForIdentity(
        activityFiles.gpx,
        activityFixtureIdentity(testInfo, "keyboard corrected import"),
      ),
    );
    await submit.focus();
    await submit.press("Enter");
    await athletePage.waitForURL(/\/activities\/[0-9a-f-]+\/?$/);
    activityId = athletePage.url().match(/\/activities\/([0-9a-f-]+)/)?.[1] ?? "";
    await expect(athletePage.getByRole("heading", { name: "Stream charts" })).toBeVisible();
  } finally {
    await deleteImportedActivity(athletePage, activityId);
  }
});

test("[variation:activities.import-retry:second-invalid] repeated invalid selections keep the importer available before a valid recovery", async ({
  athletePage,
}, testInfo) => {
  let activityId = "";
  const activities = new ActivitiesPage(athletePage);
  try {
    await activities.openImporter();
    const file = athletePage.getByTestId("activity-import-file-input");
    const submit = athletePage.getByRole("button", { name: "Import activity" });
    for (const name of ["first-invalid.gpx", "second-invalid.gpx"]) {
      await file.setInputFiles({
        name,
        mimeType: "application/gpx+xml",
        buffer: Buffer.from(`<gpx>${name}`),
      });
      await submit.click();
      await expect(athletePage.getByRole("alert")).toBeVisible();
      await expect(file).toBeVisible();
    }
    await file.setInputFiles(
      activityFileForIdentity(
        activityFiles.gpx,
        activityFixtureIdentity(testInfo, "second invalid recovery"),
      ),
    );
    await submit.click();
    await athletePage.waitForURL(/\/activities\/[0-9a-f-]+\/?$/);
    activityId = athletePage.url().match(/\/activities\/([0-9a-f-]+)/)?.[1] ?? "";
    await expect(athletePage.getByRole("heading", { name: "Route preview" })).toBeVisible();
  } finally {
    await deleteImportedActivity(athletePage, activityId);
  }
});
