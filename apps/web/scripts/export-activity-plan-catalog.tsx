import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { renderToBuffer } from "@react-pdf/renderer";
import {
  ACTIVITY_PLAN_CATALOG_PRINT_GEOMETRY,
  ACTIVITY_PLAN_CATALOG_TWO_UP_GEOMETRY,
  activityPlanCatalogNeedsBlankBeforeBackCover,
  assertActivityPlanCatalogLayout,
  buildActivityPlanCatalogLayout,
  buildActivityPlanCatalogModels,
  estimateActivityPlanTwoUpHeight,
  getActivityPlanCatalogContentPageCount,
} from "../src/lib/activity-plan-export/activity-plan-catalog";
import {
  ActivityPlanCatalogPdfDocument,
  getActivityPlanCatalogExpectedPageCount,
} from "../src/lib/activity-plan-export/activity-plan-catalog-pdf-document";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const worktreeRoot = resolve(scriptDirectory, "../../..");
const projectRoot = resolve(worktreeRoot, "../..");
const defaultOutputPath = resolve(projectRoot, "publisher-exports/activity-plan-catalog.pdf");
const outputPath = process.env.ACTIVITY_PLAN_CATALOG_OUTPUT_PATH
  ? resolve(process.env.ACTIVITY_PLAN_CATALOG_OUTPUT_PATH)
  : defaultOutputPath;
const outputDirectory = dirname(outputPath);
const execFileAsync = promisify(execFile);

function decodeXmlText(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replace(/&#(\d+);/gu, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/giu, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function normalizeExtractedText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function extractedPageContainsTitle(pageText: string, title: string): boolean {
  const normalizedPage = normalizeExtractedText(pageText);
  return title
    .split(/\s+/u)
    .map(normalizeExtractedText)
    .filter(Boolean)
    .every((token) => normalizedPage.includes(token.slice(0, Math.min(token.length, 5))));
}

async function preflightRenderedCatalog(
  pdfPath: string,
  layout: ReturnType<typeof buildActivityPlanCatalogLayout>,
): Promise<void> {
  const expectedPageCount = getActivityPlanCatalogExpectedPageCount(layout);
  if (expectedPageCount % 2 !== 0) {
    throw new Error("Catalog preflight requires the back cover to occupy an even physical page");
  }
  const preflightDirectory = await mkdtemp(join(tmpdir(), "gradientpeak-catalog-"));
  const textPath = join(preflightDirectory, "catalog.txt");
  const boundingBoxPath = join(preflightDirectory, "catalog.html");

  try {
    const { stdout: pdfInformation } = await execFileAsync("pdfinfo", [
      "-f",
      "1",
      "-l",
      String(expectedPageCount),
      "-box",
      pdfPath,
    ]);
    const reportedPageCount = Number(/Pages:\s+(\d+)/u.exec(pdfInformation)?.[1] ?? 0);
    const pageSizes = [...pdfInformation.matchAll(/Page\s+\d+ size:\s+([\d.]+) x ([\d.]+) pts/gu)];
    if (
      reportedPageCount !== expectedPageCount ||
      pageSizes.length !== expectedPageCount ||
      pageSizes.some(
        (match) =>
          Math.abs(Number(match[1]) - ACTIVITY_PLAN_CATALOG_PRINT_GEOMETRY.pageWidth) > 0.02 ||
          Math.abs(Number(match[2]) - ACTIVITY_PLAN_CATALOG_PRINT_GEOMETRY.pageHeight) > 0.02,
      )
    ) {
      throw new Error("Catalog preflight found a missing or non-bleed-size page");
    }

    await execFileAsync("pdftotext", ["-layout", pdfPath, textPath]);
    const renderedPages = (await readFile(textPath, "utf8")).split("\f");
    for (const page of layout.planPages) {
      const renderedPage = renderedPages[page.pageNumber - 1] ?? "";
      for (const entry of page.entries) {
        if (!extractedPageContainsTitle(renderedPage, entry.model.title)) {
          const actualPageIndex = renderedPages.findIndex((candidate) =>
            extractedPageContainsTitle(candidate, entry.model.title),
          );
          const actualPageMessage =
            actualPageIndex >= 0 ? `; it rendered on page ${actualPageIndex + 1}` : "";
          const expectedPageExcerpt = (renderedPages[page.pageNumber - 1] ?? "")
            .replace(/\s+/gu, " ")
            .trim()
            .slice(0, 180);
          throw new Error(
            `Catalog preflight could not find ${entry.model.title} on page ${page.pageNumber}${actualPageMessage}; page excerpt: ${expectedPageExcerpt || "[blank]"}`,
          );
        }
      }
    }
    const contentPageCount = getActivityPlanCatalogContentPageCount(layout);
    for (let pageNumber = 2; pageNumber <= contentPageCount; pageNumber += 1) {
      if (pageNumber === layout.trainingPlanSection?.alignmentBlankPageNumber) continue;
      const renderedPage = renderedPages[pageNumber - 1] ?? "";
      if (!renderedPage.includes("GRADIENTPEAK")) {
        throw new Error(`Catalog preflight found no standard logo header on page ${pageNumber}`);
      }
      if (!new RegExp(`(^|\\s)${pageNumber}(\\s|$)`, "mu").test(renderedPage)) {
        throw new Error(`Catalog preflight found no page number on page ${pageNumber}`);
      }
    }
    if (layout.trainingPlanSection) {
      const openerText = renderedPages[layout.trainingPlanSection.openerPageNumber - 1] ?? "";
      if (!openerText.includes("TRAINING-PLAN-TEMPLATES-OPENER")) {
        throw new Error("Catalog preflight could not identify the training-template opener");
      }
      for (const plan of layout.trainingPlanSection.plans) {
        const overviewText = renderedPages[plan.overviewPageNumber - 1] ?? "";
        const scheduleText = renderedPages[plan.schedulePageNumber - 1] ?? "";
        if (!overviewText.includes(`TRAINING-PLAN-OVERVIEW-${plan.id}`)) {
          throw new Error(`Catalog preflight could not identify the overview for ${plan.name}`);
        }
        if (!scheduleText.includes(`TRAINING-PLAN-SCHEDULE-${plan.id}`)) {
          throw new Error(`Catalog preflight could not identify the schedule for ${plan.name}`);
        }
        if (!overviewText.includes("Weekly session distribution")) {
          throw new Error(`Catalog preflight found no schedule visual for ${plan.name}`);
        }
        if (!scheduleText.includes("Linked activity plans")) {
          throw new Error(`Catalog preflight found no linked activity key for ${plan.name}`);
        }
      }
      if (layout.trainingPlanSection.alignmentBlankPageNumber) {
        const blankPageText =
          renderedPages[layout.trainingPlanSection.alignmentBlankPageNumber - 1] ?? "";
        if (normalizeExtractedText(blankPageText).length > 0) {
          throw new Error("Catalog preflight found content on the training-section alignment page");
        }
      }
    }
    const backCoverText = renderedPages[expectedPageCount - 1] ?? "";
    if (!backCoverText.includes("GRADIENTPEAK") || !backCoverText.includes("gradientpeak.app")) {
      throw new Error("Catalog preflight could not identify the back cover on the final page");
    }
    if (activityPlanCatalogNeedsBlankBeforeBackCover(layout)) {
      const blankPageText = renderedPages[expectedPageCount - 2] ?? "";
      if (normalizeExtractedText(blankPageText).length > 0) {
        throw new Error("Catalog preflight found content on the intentional duplex blank page");
      }
    }

    await execFileAsync("pdftotext", ["-bbox-layout", pdfPath, boundingBoxPath]);
    const boundingBoxes = await readFile(boundingBoxPath, "utf8");
    const pageMarkup = [...boundingBoxes.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/gu)];
    if (pageMarkup.length !== expectedPageCount) {
      throw new Error("Catalog preflight could not inspect every page boundary");
    }
    for (const page of layout.planPages.filter((candidate) => candidate.entries.length === 2)) {
      const markup = pageMarkup[page.pageNumber - 1]?.[1] ?? "";
      const words = [
        ...markup.matchAll(
          /<word\b[^>]*yMin="([\d.]+)"[^>]*yMax="([\d.]+)"[^>]*>([\s\S]*?)<\/word>/gu,
        ),
      ].map((word) => ({
        text: decodeXmlText(word[3] ?? ""),
        yMax: Number(word[2]),
        yMin: Number(word[1]),
      }));
      const crossesCenterBoundary = words.some(
        (word) =>
          word.yMin < ACTIVITY_PLAN_CATALOG_TWO_UP_GEOMETRY.secondContentTop &&
          word.yMax > ACTIVITY_PLAN_CATALOG_TWO_UP_GEOMETRY.firstContentBottom,
      );
      const crossesLowerBoundary = words.some(
        (word) =>
          word.yMin >= 48 &&
          word.yMin < ACTIVITY_PLAN_CATALOG_PRINT_GEOMETRY.pageHeight - 30 &&
          word.yMax > ACTIVITY_PLAN_CATALOG_TWO_UP_GEOMETRY.secondContentBottom,
      );
      if (crossesCenterBoundary || crossesLowerBoundary) {
        throw new Error(
          `Catalog preflight found activity content outside its fixed slot on page ${page.pageNumber} (${page.entries.map((entry) => `${entry.model.title} [${estimateActivityPlanTwoUpHeight(entry.model)}]`).join(" / ")}; ${crossesCenterBoundary ? "center boundary" : "lower boundary"})`,
        );
      }
      page.entries.forEach((entry, position) => {
        const contentTop =
          position === 0
            ? 60 + ACTIVITY_PLAN_CATALOG_TWO_UP_GEOMETRY.slotPadding
            : ACTIVITY_PLAN_CATALOG_TWO_UP_GEOMETRY.secondContentTop;
        const contentBottom =
          position === 0
            ? ACTIVITY_PLAN_CATALOG_TWO_UP_GEOMETRY.firstContentBottom
            : ACTIVITY_PLAN_CATALOG_TWO_UP_GEOMETRY.secondContentBottom;
        const slotWords = words.filter(
          (word) => word.yMin >= contentTop && word.yMax <= contentBottom,
        );
        const slotText = slotWords.map((word) => word.text).join(" ");
        if (!extractedPageContainsTitle(slotText, entry.model.title)) {
          throw new Error(
            `Catalog preflight found ${entry.model.title} outside position ${position + 1} on page ${page.pageNumber}`,
          );
        }
        const endMarker = slotWords.find((word) => word.text === `CATALOG-END-${entry.key}`);
        if (!endMarker) {
          throw new Error(
            `Catalog preflight found incomplete activity content in position ${position + 1} on page ${page.pageNumber}`,
          );
        }
      });
    }
    for (const page of layout.planPages.filter((candidate) => candidate.entries.length === 1)) {
      const entry = page.entries[0];
      const markup = pageMarkup[page.pageNumber - 1]?.[1] ?? "";
      const words = [
        ...markup.matchAll(
          /<word\b[^>]*yMin="([\d.]+)"[^>]*yMax="([\d.]+)"[^>]*>([\s\S]*?)<\/word>/gu,
        ),
      ].map((word) => ({
        text: decodeXmlText(word[3] ?? ""),
        yMax: Number(word[2]),
        yMin: Number(word[1]),
      }));
      const bodyWords = words.filter((word) => word.yMin >= 60 && word.yMax <= 770);
      const bodyText = bodyWords.map((word) => word.text).join(" ");
      if (!extractedPageContainsTitle(bodyText, entry.model.title)) {
        throw new Error(
          `Catalog preflight found ${entry.model.title} outside the full-page body on page ${page.pageNumber}`,
        );
      }
      if (!bodyWords.some((word) => word.text === `CATALOG-END-${entry.key}`)) {
        throw new Error(
          `Catalog preflight found incomplete full-page content on page ${page.pageNumber}`,
        );
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "Catalog preflight requires the pdfinfo and pdftotext commands from Poppler",
        {
          cause: error,
        },
      );
    }
    throw error;
  } finally {
    await rm(preflightDirectory, { force: true, recursive: true });
  }
}

if (outputPath.startsWith(`${worktreeRoot}${sep}`)) {
  throw new Error("Catalog output must remain outside the dev worktree");
}

const entries = buildActivityPlanCatalogModels();
const layout = buildActivityPlanCatalogLayout(entries);
assertActivityPlanCatalogLayout(layout, entries);
await mkdir(outputDirectory, { recursive: true });
const buffer = await renderToBuffer(<ActivityPlanCatalogPdfDocument layout={layout} />);
const expectedPageCount = getActivityPlanCatalogExpectedPageCount(layout);
const candidateDirectory = await mkdtemp(join(outputDirectory, ".activity-plan-catalog-"));
const candidateOutputPath = join(candidateDirectory, "candidate.pdf");
try {
  await writeFile(candidateOutputPath, buffer);
  await preflightRenderedCatalog(candidateOutputPath, layout);
  await rename(candidateOutputPath, outputPath);
} finally {
  await unlink(candidateOutputPath).catch(() => undefined);
  await rm(candidateDirectory, { force: true, recursive: true });
}

const twoUpPageCount = layout.planPages.filter((page) => page.entries.length === 2).length;
console.log(
  `Rendered ${entries.length} GradientPeak activity plans and ${layout.trainingPlanSection?.plans.length ?? 0} training templates across ${expectedPageCount} duplex-ready 8.75 × 11.25 inch pages (${twoUpPageCount} two-up pages) to ${outputPath}`,
);
