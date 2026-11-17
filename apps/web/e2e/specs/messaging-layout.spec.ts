import { expect, test } from "../fixtures/messaging";
import { MessagingPage } from "../pages";

test("messaging conversation keeps the composer and long messages within mobile and desktop bounds", async ({
  messaging,
}, testInfo) => {
  const { a, b } = messaging.actors;
  const sender = new MessagingPage(a.page);
  const normalMessage =
    "Please review the interval instructions before you begin your next distance session.";
  const longMessage = `Readable conversation text ${"x".repeat(640)}`;

  await sender.startDirectMessage(b.username);
  await sender.send(normalMessage);
  await sender.send(longMessage);
  const normalBubble = a.page.getByText(normalMessage, { exact: true }).last();
  await expect(normalBubble).toBeVisible();
  await expect(a.page.getByText(longMessage, { exact: true }).last()).toBeVisible();
  await expect
    .poll(() =>
      normalBubble.evaluate((element) => {
        const styles = window.getComputedStyle(element);
        return { overflowWrap: styles.overflowWrap, wordBreak: styles.wordBreak };
      }),
    )
    .toEqual({ overflowWrap: "anywhere", wordBreak: "normal" });

  for (const viewport of [
    { width: 320, height: 844 },
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
  ]) {
    await a.page.setViewportSize(viewport);

    const composer = a.page.getByPlaceholder("Type a message...");
    const send = a.page.getByRole("button", { name: "Send message" });
    const bubble = a.page.getByText(longMessage, { exact: true }).last();
    await expect(composer).toBeVisible();
    await expect(send).toBeVisible();
    await expect(bubble).toBeVisible();

    const [composerBounds, sendBounds, bubbleBounds] = await Promise.all([
      composer.boundingBox(),
      send.boundingBox(),
      bubble.boundingBox(),
    ]);
    for (const bounds of [composerBounds, sendBounds, bubbleBounds]) {
      expect(bounds).not.toBeNull();
      if (!bounds) continue;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
    }
    for (const bounds of [composerBounds, sendBounds]) {
      expect(bounds).not.toBeNull();
      if (!bounds) continue;
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    expect(
      await a.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBeTruthy();

    const screenshot = testInfo.outputPath(`messaging-layout-${viewport.width}.png`);
    await a.page.screenshot({ path: screenshot, scale: "css" });
    await testInfo.attach(`messaging-layout-${viewport.width}`, {
      contentType: "image/png",
      path: screenshot,
    });
  }
});
