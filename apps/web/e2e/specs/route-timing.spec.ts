import { expect, test } from "../fixtures";

// Diagnostic baseline, not a speed acceptance gate. Uses disposable actor data;
// never logs response bodies, credentials, or query-string inputs.
test("measures authenticated cold documents and repeat navigation", async ({
  athleteActor,
}, testInfo) => {
  test.setTimeout(180_000);
  const context = await athleteActor.createContext();
  const page = await context.newPage();
  const inspectorRequests: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (
      pathname.includes("react-devtools") ||
      pathname.includes("react_devtools") ||
      pathname.includes("router-devtools") ||
      pathname.includes("router_devtools")
    )
      inspectorRequests.push(pathname);
  });
  await page.addInitScript(() => {
    performance.setResourceTimingBufferSize(5000);
    const observer = new MutationObserver(() => {
      if (document.querySelector('body > div[aria-busy="false"]')) {
        performance.mark("app-hydrated");
        observer.disconnect();
      }
    });
    observer.observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-busy"],
    });
  });
  // Chromium's sampling profile separates browser initialization from network
  // time without collecting application records or response bodies.
  const profiler = await context.newCDPSession(page);
  await profiler.send("Profiler.enable");
  await profiler.send("Profiler.start");
  const requests: Array<{ path: string; milliseconds: number; status: number }> = [];
  page.on("requestfinished", async (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/_server/")) return;
    const timing = request.timing();
    requests.push({
      path: url.pathname,
      milliseconds: Math.round(timing.responseEnd),
      status: (await request.response())?.status() ?? 0,
    });
  });
  const measurements: Array<{ path: string; mode: string; milliseconds: number }> = [];
  const documents: unknown[] = [];
  const ready = async (path: string) => {
    await expect(page.locator('[aria-busy="false"]').first()).toBeVisible();
    const text =
      path === "/"
        ? "Upcoming Schedule"
        : path === "/calendar"
          ? "Personal planned sessions"
          : path === "/goals"
            ? "Goals"
            : "Filter activities";
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
  };
  for (const path of ["/", "/calendar", "/goals", "/activities"]) {
    for (const mode of ["cold-document", "repeat-document"]) {
      const start = Date.now();
      const response = await page.goto(path);
      expect(response?.ok()).toBe(true);
      await ready(path);
      measurements.push({ path, mode, milliseconds: Date.now() - start });
      documents.push(
        await page.evaluate(() => {
          const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
          const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
          return {
            path: location.pathname,
            hydrationMs: Math.round(
              performance.getEntriesByName("app-hydrated")[0]?.startTime ?? -1,
            ),
            firstByteMs: Math.round(nav.responseStart),
            documentEndMs: Math.round(nav.responseEnd),
            domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
            loadMs: Math.round(nav.loadEventEnd),
            resources: resources.length,
            slowResources: resources
              .filter((item) => item.duration > 500)
              .map((item) => ({
                path: new URL(item.name).pathname,
                startMs: Math.round(item.startTime),
                durationMs: Math.round(item.duration),
              }))
              .sort((a, b) => b.durationMs - a.durationMs)
              .slice(0, 15),
            decodedBytes: resources.reduce((sum, item) => sum + item.decodedBodySize, 0),
            javascriptRequests: resources.filter((item) => item.initiatorType === "script").length,
          };
        }),
      );
      if (path === "/" && mode === "repeat-document") {
        const { profile } = await profiler.send("Profiler.stop");
        const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
        const totals = new Map<string, number>();
        for (const [index, id] of (profile.samples ?? []).entries()) {
          const frame = nodes.get(id)?.callFrame;
          const source = frame?.url
            ? new URL(frame.url, "http://localhost").pathname
            : (frame?.functionName ?? "unknown");
          totals.set(source, (totals.get(source) ?? 0) + (profile.timeDeltas?.[index] ?? 0));
        }
        const summary = [...totals]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([source, microseconds]) => ({
            source,
            milliseconds: Math.round(microseconds / 1000),
          }));
        console.info("STARTUP_CPU", JSON.stringify(summary));
        await testInfo.attach("startup-cpu-summary", {
          body: JSON.stringify(summary, null, 2),
          contentType: "application/json",
        });
      }
    }
  }
  for (const path of ["/", "/calendar", "/activities", "/", "/calendar", "/activities"]) {
    const link = page.locator(`a[href="${path}"]:visible`).first();
    await expect(link).toBeVisible();
    const start = Date.now();
    await link.click();
    await expect(page).toHaveURL((url) => url.pathname === path);
    await ready(path);
    measurements.push({ path, mode: "client-navigation", milliseconds: Date.now() - start });
  }
  if (process.env.VITE_ENABLE_DEVTOOLS !== "true") expect(inspectorRequests).toEqual([]);
  const report = JSON.stringify(
    {
      limitations:
        "Disposable athlete without activity history, desktop loopback development server; route content marker does not prove all secondary data rendered",
      measurements,
      documents,
      requests,
    },
    null,
    2,
  );
  console.info(report);
  await testInfo.attach("route-timings", { body: report, contentType: "application/json" });
});
