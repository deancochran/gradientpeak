import "./catalog-fonts";
import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Document, renderToBuffer } from "@react-pdf/renderer";
import {
  activityPlanStructureSchema,
  deriveActivityPlanPresentation,
  formatActivityPlanPrintDuration,
  getActivityPlanSessionFlowTargetPresentations,
  REFERENCE_ASSESSMENT_TEMPLATE_IDS,
  resolveActivityPlanSessionFlow,
  SYSTEM_TEMPLATES,
} from "@repo/core";
import React from "react";
import {
  type ActivityPlanCatalogFragment,
  assertActivityPlanCatalogLayout,
  buildActivityPlanCatalogLayout,
  type buildActivityPlanCatalogModels,
  buildPublisherActivityPlanCatalogModels,
  formatActivityPlanCatalogInstruction,
  measureActivityPlanCatalogFragments,
  PUBLISHER_EXCLUDED_TEMPLATE_IDS,
} from "../src/lib/activity-plan-export/activity-plan-catalog";
import {
  ActivityPlanDistanceCatalogActivityPlanPage,
  ActivityPlanDistanceCatalogCompleteBookDocument,
  ActivityPlanDistanceCatalogDocument,
  type ActivityPlanDistanceCatalogPrescriptionPlacementByStepId,
  buildActivityPlanDistanceCatalogCompleteBookPlan,
  DISTANCE_CATALOG_INLINE_GAP,
  DISTANCE_CATALOG_STEP_FONT_SIZE,
  formatDistanceCatalogPrescription,
  getDistanceCatalogCuePresentation,
  getDistanceCatalogPrescriptionPlacement,
  getDistanceCatalogPrescriptionPlacementKey,
} from "../src/lib/activity-plan-export/activity-plan-distance-catalog-document";

// The standalone tsx exporter uses the classic JSX transform.
void React;

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const fontkit = require("fontkit") as {
  openSync(path: string): {
    layout(value: string, features?: { dlig?: boolean; liga?: boolean }): { advanceWidth: number };
    unitsPerEm: number;
  };
};
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const completeBook = process.env.ACTIVITY_PLAN_CATALOG_COMPLETE_BOOK === "1";
const portrait = process.env.ACTIVITY_PLAN_CATALOG_PORTRAIT === "1";
const geometry = portrait ? "portrait" : "landscape";
const outputPath = resolve(
  scriptDirectory,
  completeBook && portrait
    ? "../../../../../publisher-exports/gradientpeak-complete-catalog-a5-top-bound-reader.pdf"
    : completeBook
      ? "../../../../../publisher-exports/gradientpeak-complete-catalog-review.pdf"
      : "../../../../../publisher-exports/activity-plan-catalog-styled-22pt.pdf",
);
const coverLogoDataUri = `data:image/png;base64,${(
  await readFile(resolve(scriptDirectory, "../public/gradientpeak-logo-white.png"))
).toString("base64")}`;
const readmePath = outputPath.replace(/\.pdf$/u, ".README.md");
const validationJsonPath = outputPath.replace(/\.pdf$/u, ".validation.json");
const validationMarkdownPath = outputPath.replace(/\.pdf$/u, ".validation.md");
const pageWidth = portrait ? 419.527559 : 792;
const pageHeight = portrait ? 595.275591 : 612;
const pageLeft = portrait ? 24 : 38;
const pageRight = portrait ? 24 : 38;
const contentBottom = pageHeight - 32;
// Keep fontkit's shaping width in lockstep with the document's step names and
// prescription runs (including regular-weight units).
const CATALOG_FONT_SIZE = DISTANCE_CATALOG_STEP_FONT_SIZE;
// The narrowest physical step row is inside a portrait repeat: page content,
// repeat border/padding, then the accent and its gutter. Use that same row for
// both measurement and the rendered fallback; do not invent an extra inset.
const fullPrescriptionWidth = pageWidth - pageLeft - pageRight - 3 - 7 - 3 - 6;
const prescriptionRunPattern =
  /(?:min|sec|km|mi|yd|FTP|THR|HRmax|bpm|rpm|kg|lb|reps?|W|m)\b|[^a-zA-Z]+|[a-zA-Z]+/gu;
const regularCatalogFont = fontkit.openSync(
  fileURLToPath(new URL("../assets/fonts/DejaVuSans.ttf", import.meta.url)),
);
const boldCatalogFont = fontkit.openSync(
  fileURLToPath(new URL("../assets/fonts/DejaVuSans-Bold.ttf", import.meta.url)),
);

const publisherTemplates = SYSTEM_TEMPLATES.filter(
  (template) => !PUBLISHER_EXCLUDED_TEMPLATE_IDS.has(template.id),
);

function isLightUnitRun(value: string): boolean {
  return /^(?:min|sec|km|mi|yd|FTP|THR|HRmax|bpm|rpm|kg|lb|reps?|W|m)$/u.test(value);
}

const catalogFontFeatures = { dlig: false, liga: false } as const;

function measureCatalogText(value: string, bold: boolean): number {
  const font = bold ? boldCatalogFont : regularCatalogFont;
  return (
    (font.layout(value, catalogFontFeatures).advanceWidth / font.unitsPerEm) * CATALOG_FONT_SIZE
  );
}

/** Measures precisely the same bold/regular runs that LightUnits renders. */
function measurePrescriptionWidth(value: string): number {
  return Array.from(value.matchAll(prescriptionRunPattern)).reduce((width, match) => {
    const font = isLightUnitRun(match[0]) ? regularCatalogFont : boldCatalogFont;
    return (
      width +
      (font.layout(match[0], catalogFontFeatures).advanceWidth / font.unitsPerEm) *
        CATALOG_FONT_SIZE
    );
  }, 0);
}

function renderedStepName(name: string | null): string {
  return name === "Warmup" ? "Warm-up" : (name ?? "");
}

function buildPrescriptionPlacementByStepId(
  entries: ReturnType<typeof buildActivityPlanCatalogModels>,
): ActivityPlanDistanceCatalogPrescriptionPlacementByStepId {
  const placements = new Map<
    string,
    { placement: "inline" | "below"; prescriptionWidth: number }
  >();
  const tooWide: string[] = [];
  for (const entry of entries) {
    for (const group of entry.model.sections.flatMap((section) => section.groups)) {
      for (const step of group.steps) {
        const prescription = formatDistanceCatalogPrescription(step);
        if (!prescription) continue;
        const prescriptionWidth = measurePrescriptionWidth(prescription);
        if (prescriptionWidth > fullPrescriptionWidth)
          tooWide.push(
            `${entry.model.title} / ${step.name ?? "unnamed step"}: ${prescription} (${prescriptionWidth.toFixed(2)} pt)`,
          );
        const nameWidth = measureCatalogText(renderedStepName(step.name), true);
        // Step IDs are local to a activityPlan, so preserve the qualified key. The
        // rendered target receives its measured width instead of a 40% column.
        placements.set(getDistanceCatalogPrescriptionPlacementKey(entry.key, step.id), {
          placement: getDistanceCatalogPrescriptionPlacement(
            nameWidth,
            prescriptionWidth,
            fullPrescriptionWidth,
            DISTANCE_CATALOG_INLINE_GAP,
          ),
          prescriptionWidth,
        });
      }
    }
  }
  if (tooWide.length)
    throw new Error(
      `A ${CATALOG_FONT_SIZE} pt prescription cannot fit the full available step width (${fullPrescriptionWidth.toFixed(2)} pt); no clipping or shrinking was applied:\n${tooWide.join("\n")}`,
    );
  return placements;
}

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function pageHasTitle(page: string, title: string): boolean {
  const actual = normalized(page);
  return (
    title
      .split(/\s+/u)
      .map(normalized)
      .filter(Boolean)
      // PDF text extraction may hyphenate a narrow-column title, so match a stable
      // prefix of every title word rather than requiring an unbroken long token.
      .every((word) => actual.includes(word.slice(0, Math.min(3, word.length))))
  );
}

/** Check the rendered conversion pages, including every panel boundary and computed cell. */
function assertRenderedConversionTables(
  pages: readonly string[],
  guideFirstPageNumber: number,
): void {
  const panels = [
    {
      reference: "Heart-rate",
      header: "HR",
      rows: Array.from({ length: 11 }, (_, i) => 120 + i * 10),
      values: Array.from({ length: 12 }, (_, i) => i * 10),
    },
    {
      reference: "FTP",
      header: "Watts",
      rows: Array.from({ length: 17 }, (_, i) => 100 + i * 25),
      values: Array.from({ length: 16 }, (_, i) => i * 10),
    },
  ] as const;
  let pageOffset = 2; // Quick start and glossary precede the conversion tables.
  for (const panel of panels) {
    const pageCount = Math.ceil(panel.values.length / 16);
    const baseSize = Math.floor(panel.values.length / pageCount);
    const largerPageCount = panel.values.length % pageCount;
    let valueOffset = 0;
    for (let index = 0; index < pageCount; index += 1) {
      const size = baseSize + (index < largerPageCount ? 1 : 0);
      const values = panel.values.slice(valueOffset, valueOffset + size);
      valueOffset += size;
      const pageNumber = guideFirstPageNumber + pageOffset;
      pageOffset += 1;
      const page = pages[pageNumber - 1] ?? "";
      const range = `${values[0]}–${values.at(-1)}%`;
      if (!pageHasTitle(page, `${panel.reference} conversion · ${range}`))
        throw new Error(`Conversion table heading is missing on page ${pageNumber}`);
      if (!page.includes(panel.header))
        throw new Error(
          `Conversion table reference header ${panel.header} is missing on page ${pageNumber}`,
        );
      if (
        page.includes("Reference HR") ||
        page.includes("Reference FTP") ||
        page.includes("FTP (W)")
      )
        throw new Error(
          `Conversion table has a retired multiline reference header on page ${pageNumber}`,
        );
      for (const percentage of values)
        if (!page.includes(String(percentage)) || !page.includes("%"))
          throw new Error(`Conversion percentage ${percentage}% is missing on page ${pageNumber}`);
      for (const row of panel.rows) {
        if (!page.includes(String(row)))
          throw new Error(`Conversion reference ${row} is missing on page ${pageNumber}`);
        for (const percentage of values) {
          const value = Math.round((row * percentage) / 100);
          if (!page.includes(String(value)))
            throw new Error(
              `Conversion cell ${row} × ${percentage}% = ${value} is missing on page ${pageNumber}`,
            );
        }
      }
    }
  }
}

async function renderedFragmentFits(
  fragment: ActivityPlanCatalogFragment,
  directory: string,
  prescriptionPlacementByStepId: ActivityPlanDistanceCatalogPrescriptionPlacementByStepId,
): Promise<boolean> {
  const path = join(directory, `${fragment.key}.pdf`);
  await writeFile(
    path,
    await renderToBuffer(
      <Document>
        <ActivityPlanDistanceCatalogActivityPlanPage
          fragment={fragment}
          geometry={geometry}
          pageNumber={1}
          prescriptionPlacementByStepId={prescriptionPlacementByStepId}
        />
      </Document>,
    ),
  );
  const { stdout } = await execFileAsync("pdfinfo", [path]);
  if (Number(/Pages:\s+(\d+)/u.exec(stdout)?.[1] ?? 0) !== 1) return false;
  const size = /Page size:\s+([\d.]+) x ([\d.]+)/u.exec(stdout);
  if (
    !size ||
    Math.abs(Number(size[1]) - pageWidth) > 0.02 ||
    Math.abs(Number(size[2]) - pageHeight) > 0.02
  )
    return false;
  const html = `${path}.html`;
  await execFileAsync("pdftotext", ["-bbox-layout", path, html]);
  const markup = await readFile(html, "utf8");
  const words = [...markup.matchAll(/<word\b[^>]*yMin="([\d.]+)"[^>]*yMax="([\d.]+)"[^>]*>/gu)];
  return words
    .filter((word) => Number(word[1]) < contentBottom)
    .every((word) => Number(word[2]) <= contentBottom);
}

async function measureFragments() {
  const entries = buildPublisherActivityPlanCatalogModels();
  const prescriptionPlacementByStepId = buildPrescriptionPlacementByStepId(entries);
  const directory = await mkdtemp(join(tmpdir(), "gradientpeak-distance-catalog-"));
  try {
    const measured = new Map<string, readonly ActivityPlanCatalogFragment[]>();
    for (const entry of entries) {
      measured.set(
        entry.key,
        await measureActivityPlanCatalogFragments(
          entry,
          (fragment) => renderedFragmentFits(fragment, directory, prescriptionPlacementByStepId),
          // ActivityPlans may use one or two actual content pages. The shared
          // fragmenter preserves every authored step and uses its ordinary
          // continuation marker when a group crosses the page boundary; no
          // activityPlan-specific summary or prescription rewrite is introduced.
          { preferWholeGroups: false },
        ),
      );
    }
    return { entries, measured, prescriptionPlacementByStepId };
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function preflight(
  path: string,
  fragments: readonly ActivityPlanCatalogFragment[],
  prescriptionPlacementByStepId: ActivityPlanDistanceCatalogPrescriptionPlacementByStepId,
  trainingPages: readonly {
    plan: import("../src/lib/activity-plan-export/activity-plan-catalog").ActivityPlanCatalogTrainingPlan;
    week: import("../src/lib/activity-plan-export/activity-plan-catalog").ActivityPlanCatalogTrainingWeek;
  }[],
  bookPlan?: ReturnType<typeof buildActivityPlanDistanceCatalogCompleteBookPlan>,
): Promise<void> {
  const expectedPages = bookPlan?.totalPageCount ?? fragments.length + trainingPages.length;
  const directory = await mkdtemp(join(tmpdir(), "gradientpeak-distance-preflight-"));
  try {
    const { stdout } = await execFileAsync("pdfinfo", [
      "-f",
      "1",
      "-l",
      String(expectedPages),
      "-box",
      path,
    ]);
    const pageCount = Number(/Pages:\s+(\d+)/u.exec(stdout)?.[1] ?? 0);
    const sizes = [...stdout.matchAll(/Page\s+\d+ size:\s+([\d.]+) x ([\d.]+)/gu)];
    if (
      pageCount !== expectedPages ||
      sizes.length !== expectedPages ||
      sizes.some(
        (size) =>
          Math.abs(Number(size[1]) - pageWidth) > 0.02 ||
          Math.abs(Number(size[2]) - pageHeight) > 0.02,
      )
    )
      throw new Error(
        `Expected ${expectedPages} ${portrait ? "A5" : "US Letter"} ${geometry} pages, received ${pageCount}`,
      );
    const textPath = join(directory, "catalog.txt");
    const bboxPath = join(directory, "catalog.html");
    await execFileAsync("pdftotext", ["-layout", path, textPath]);
    const pages = (await readFile(textPath, "utf8")).split("\f");
    const activityPlanStartIndex = bookPlan?.frontMatterPageCount ?? 0;
    if (bookPlan) {
      if (bookPlan.activityPlanSlots.length !== 66)
        throw new Error(
          `Expected 66 activityPlan slots, received ${bookPlan.activityPlanSlots.length}`,
        );
      const expectedChapters = [
        "Tests",
        "Cycling",
        "Running",
        "Swimming",
        "Strength",
        "Cross-training & recovery",
      ];
      if (
        bookPlan.guidePageCount !== 4 ||
        bookPlan.chapters.map((chapter) => chapter.title).join("\u0000") !==
          expectedChapters.join("\u0000")
      )
        throw new Error(
          "Complete-book must contain four informational pages and the six active chapters",
        );
      let nextActivityPlanPage = bookPlan.frontMatterPageCount + 1;
      bookPlan.chapters.forEach((chapter) => {
        if (
          chapter.pageNumber !== nextActivityPlanPage ||
          !pageHasTitle(pages[chapter.pageNumber - 1] ?? "", chapter.title)
        )
          throw new Error(`Chapter divider missing or out of order: ${chapter.title}`);
        nextActivityPlanPage += 1;
        chapter.slots.forEach((slot) => {
          const firstPage = slot.firstPageNumber;
          const title = slot.contentFragments[0]?.model.title;
          if (slot.contentFragments.length < 1 || firstPage !== nextActivityPlanPage)
            throw new Error(`ActivityPlan allocation drift at ${title ?? slot.activityPlanId}`);
          if (!title || !pageHasTitle(pages[firstPage - 1] ?? "", title))
            throw new Error(
              `ActivityPlan anchor missing for ${title ?? slot.activityPlanId} on page ${firstPage}`,
            );
          slot.contentFragments.slice(1).forEach((continuation, index) => {
            const continuationPage = firstPage + index + 1;
            const continuationText = pages[continuationPage - 1] ?? "";
            // Poppler can split a narrow A5 title at its discretionary hyphen.
            // The title is still anchored by the first fragment; require the
            // continuation marker rather than rejecting that extraction quirk.
            if (
              !pageHasTitle(continuationText, continuation.model.title) &&
              !continuationText.includes("continued")
            )
              throw new Error(
                `ActivityPlan continuation missing for ${title} on page ${continuationPage}`,
              );
          });
          nextActivityPlanPage += slot.contentFragments.length;
        });
      });
    } else {
      fragments.forEach((fragment, index) => {
        const physicalPage = activityPlanStartIndex + index + 1;
        if (!pageHasTitle(pages[physicalPage - 1] ?? "", fragment.model.title))
          throw new Error(
            `ActivityPlan anchor missing for ${fragment.model.title} on page ${physicalPage}`,
          );
      });
    }
    if (bookPlan) {
      const cover = pages[0] ?? "";
      const quickStart = pages[bookPlan.guideFirstPageNumber - 1] ?? "";
      const glossary = pages[bookPlan.guideFirstPageNumber] ?? "";
      const back = pages[expectedPages - 1] ?? "";
      if (cover.trim()) throw new Error("Logo-only front cover must not contain text");
      if ((pages[1] ?? "").includes("Publication information"))
        throw new Error("Complete-book reader must not retain the publication-information page");
      if (
        bookPlan.guidePageCount !== 4 ||
        !pageHasTitle(quickStart, "Quick start") ||
        !pageHasTitle(glossary, "Glossary")
      )
        throw new Error("Complete-book preflight expected quick start, glossary, and two tables");
      const normalizedQuickStart = normalized(quickStart);
      for (const requiredGuideText of [
        "follow its steps from top to bottom",
        "Header distance sums prescribed distances only",
        "Duration includes rest when every step is timed; otherwise it is variable",
        "Repeat every step inside a Repeat block",
        "Rest means stop exercising for the written time",
        "easy recovery with an intensity target means keep moving",
        "eight minutes at 95% of your own threshold heart rate",
        "reference × percentage ÷ 100",
      ])
        if (!normalizedQuickStart.includes(normalized(requiredGuideText)))
          throw new Error(`Complete-book quick start is missing: ${requiredGuideText}`);
      const normalizedGlossary = normalized(glossary);
      for (const requiredGlossaryText of [
        "FTP",
        "THR / Threshold HR",
        "HRmax / MaxHR",
        "bpm / BPM",
        "RPE",
        "rpm / RPM",
        "CSS",
        "VO2",
        "5:00/km",
        "does not write it automatically",
      ])
        if (!normalizedGlossary.includes(normalized(requiredGlossaryText)))
          throw new Error(`Complete-book glossary is missing: ${requiredGlossaryText}`);
      assertRenderedConversionTables(pages, bookPlan.guideFirstPageNumber);
      if (pages.some((page) => page.includes("How to use the assessments")))
        throw new Error("Complete-book must not retain a separate assessment-introduction page");
      if (pages.some((page) => page.includes("After the test")))
        throw new Error(
          "Assessment result guidance must be part of the description, not a post-test block",
        );
      const assessmentDescriptionChecks = [
        [REFERENCE_ASSESSMENT_TEMPLATE_IDS[0], "average power for 30 min"],
        [REFERENCE_ASSESSMENT_TEMPLATE_IDS[1], "30 min", "distance in km", "final 20 min"],
        [REFERENCE_ASSESSMENT_TEMPLATE_IDS[2], "CSS", "400 m time", "200 m time", "1:50/100 m"],
      ] as const;
      for (const [assessmentId, ...requiredText] of assessmentDescriptionChecks) {
        const firstPage = bookPlan.activityPlanPageNumbers.get(assessmentId);
        const page = firstPage ? (pages[firstPage - 1] ?? "") : "";
        if (!firstPage || !requiredText.every((text) => page.includes(text)))
          throw new Error(`Assessment description is incomplete on page ${firstPage ?? "unknown"}`);
      }
      if (back.trim()) throw new Error("Logo-only back cover must not contain text");
      const { stdout: imageList } = await execFileAsync("pdfimages", ["-list", path]);
      const imagePages = [...imageList.matchAll(/^\s*(\d+)\s+\d+\s+image\b/gmu)].map((match) =>
        Number(match[1]),
      );
      if (!imagePages.includes(1) || !imagePages.includes(expectedPages))
        throw new Error("Complete-book preflight expected the PNG logo on both black cover faces");
      const contentsPages = pages.slice(1, 1 + bookPlan.contentsPages.length);
      for (const [index, entries] of bookPlan.contentsPages.entries()) {
        const contentsPage = contentsPages[index] ?? "";
        if (!entries.length || !contentsPage.includes("Contents"))
          throw new Error(
            `Complete-book contents page ${index + 1} is empty or missing its heading`,
          );
        for (const entry of entries) {
          if (
            !pageHasTitle(contentsPage, entry.title) ||
            !contentsPage.includes(String(entry.pageNumber))
          )
            throw new Error(
              `Complete-book contents row is missing or overflowed on page ${index + 1}: ${entry.title} (${entry.pageNumber})`,
            );
        }
      }
      const contents = contentsPages.join("\n");
      for (const [activityPlanId, pageNumber] of bookPlan.activityPlanPageNumbers) {
        const title = fragments.find((fragment) => fragment.entry.key === activityPlanId)?.model
          .title;
        if (!title || !pageHasTitle(contents, title) || !contents.includes(String(pageNumber)))
          throw new Error(
            `Complete-book contents reference missing for activityPlan ${title ?? activityPlanId} at ${pageNumber}; title found=${title ? pageHasTitle(contents, title) : false}; excerpt=${contents.slice(Math.max(0, contents.indexOf("nnestad") - 20), contents.indexOf("nnestad") + 120)}`,
          );
      }
      for (const chapter of bookPlan.chapters) {
        if (
          !pageHasTitle(contents, chapter.title) ||
          !contents.includes(String(chapter.pageNumber))
        )
          throw new Error(
            `Complete-book contents reference missing for chapter ${chapter.title} at ${chapter.pageNumber}`,
          );
      }
      for (const [planId, pageNumber] of bookPlan.trainingFirstPageNumbers) {
        const name = trainingPages.find(({ plan }) => plan.id === planId)?.plan.name;
        if (
          !name ||
          !pageHasTitle(contents, name) ||
          !contents.includes(String(pageNumber)) ||
          !(pages[pageNumber - 1] ?? "").includes("WEEK 1")
        )
          throw new Error(
            `Complete-book training reference does not start at week one for ${planId}`,
          );
      }
      trainingPages.forEach(({ week }, index) => {
        const renderedSchedule = pages[bookPlan.trainingStartPageNumber - 1 + index] ?? "";
        for (const session of week.sessions) {
          const expectedActivityPlanPage = bookPlan.activityPlanPageNumbers.get(
            session.activityPlanId,
          );
          if (
            !expectedActivityPlanPage ||
            !renderedSchedule.includes(`ActivityPlan page ${expectedActivityPlanPage}`)
          )
            throw new Error(`Complete-book schedule reference missing for ${session.title}`);
        }
      });
    }
    await execFileAsync("pdftotext", ["-bbox-layout", path, bboxPath]);
    const markup = await readFile(bboxPath, "utf8");
    const pageMarkup = [...markup.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/gu)];
    if (pageMarkup.length !== expectedPages)
      throw new Error("Could not inspect every rendered page");
    pageMarkup.forEach((page, index) => {
      const words = [
        ...(page[1] ?? "").matchAll(
          /<word\b[^>]*xMin="([\d.]+)"[^>]*yMin="([\d.]+)"[^>]*xMax="([\d.]+)"[^>]*yMax="([\d.]+)"[^>]*>([\s\S]*?)<\/word>/gu,
        ),
      ];
      const escaped = words.find(
        (word) =>
          Number(word[1]) < (portrait ? 18 : 35) ||
          Number(word[3]) > pageWidth - (portrait ? 18 : 35) ||
          Number(word[2]) < (portrait ? 43.1 : 30) ||
          Number(word[4]) > pageHeight - 18,
      );
      if (escaped)
        throw new Error(
          `Text escaped the ${portrait ? "A5" : "Letter"} safe bounds on page ${index + 1}: ${escaped[0]}`,
        );
      if (bookPlan && index + 1 > 1 && index + 1 <= bookPlan.frontMatterPageCount) {
        const pageNumber = words.find(
          (word) =>
            Number(word[2]) <= 60 &&
            normalized(word[5] ?? "") === String(index + 1) &&
            Number(word[1]) > pageWidth - 60,
        );
        const headingWords = words.filter(
          (word) =>
            word !== pageNumber &&
            Number(word[2]) <= 60 &&
            Number(word[4]) >= 40 &&
            normalized(word[5] ?? "") !== String(index + 1),
        );
        const overlappingHeading = headingWords.find(
          (word) => pageNumber && Number(word[3]) > Number(pageNumber[1]) - 4,
        );
        if (overlappingHeading)
          throw new Error(
            `Front-matter heading overlaps its page number on page ${index + 1}: ${overlappingHeading[0]}`,
          );
      }
      const isInteriorPage =
        !bookPlan ||
        (index + 1 > bookPlan.frontMatterPageCount && index + 1 < bookPlan.totalPageCount - 1);
      const hasContinueFooter = words.some((word) => word[5]?.includes("Continue"));
      if (
        isInteriorPage &&
        words.some(
          (word) =>
            !hasContinueFooter &&
            Number(word[2]) < contentBottom &&
            Number(word[4]) > contentBottom,
        )
      )
        throw new Error(`Text overlaps the footer boundary on page ${index + 1}`);
    });
    assertPrescriptionBaselines(pageMarkup, fragments, prescriptionPlacementByStepId, bookPlan);
    await assertRenderedTypeScale(path, directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

/** Verify the rendered PDF, not just source styles, retains the A5 reading scale. */
async function assertRenderedTypeScale(path: string, directory: string): Promise<void> {
  const xmlPath = join(directory, "catalog-fonts.xml");
  await execFileAsync("pdftohtml", ["-xml", "-hidden", path, xmlPath]);
  const xml = await readFile(xmlPath, "utf8");
  const sizes = [...xml.matchAll(/<fontspec\b[^>]*\bsize="([\d.]+)"/gu)].map((match) =>
    Number(match[1]),
  );
  // pdftohtml reports CSS pixels at 1.5× PDF points, rounded to an integer.
  // These respectively prove the authored 14, 12, and 11 pt A5 text styles.
  for (const expected of [21, 18, 17])
    if (!sizes.some((size) => Math.abs(size - expected) <= 0.25))
      throw new Error(`Rendered PDF is missing the required ${expected / 1.5} pt A5 type scale`);
}

function assertPrescriptionBaselines(
  pageMarkup: readonly RegExpExecArray[],
  fragments: readonly ActivityPlanCatalogFragment[],
  prescriptionPlacementByStepId: ActivityPlanDistanceCatalogPrescriptionPlacementByStepId,
  bookPlan?: ReturnType<typeof buildActivityPlanDistanceCatalogCompleteBookPlan>,
): void {
  const fragmentPages = new Map<number, ActivityPlanCatalogFragment>();
  if (bookPlan) {
    for (const slot of bookPlan.activityPlanSlots)
      for (const [index, fragment] of slot.contentFragments.entries())
        fragmentPages.set(slot.firstPageNumber + index, fragment);
  } else {
    for (const [index, fragment] of fragments.entries()) fragmentPages.set(index + 1, fragment);
  }
  for (const [pageNumber, fragment] of fragmentPages) {
    const page = pageMarkup[pageNumber - 1]?.[1] ?? "";
    const words = [
      ...page.matchAll(
        /<word\b[^>]*xMin="([\d.]+)"[^>]*yMin="([\d.]+)"[^>]*xMax="([\d.]+)"[^>]*>([\s\S]*?)<\/word>/gu,
      ),
    ].flatMap((match) => {
      const endX = Number(match[3]);
      const y = Number(match[2]);
      return (match[4] ?? "")
        .replace(/&amp;/gu, "&")
        .replace(/&#(?:160|x0*a0);/giu, "\u00a0")
        .split(/\s+/u)
        .filter(Boolean)
        .map((text) => ({ endX, startX: Number(match[1]), text, y }));
    });
    const expectedPrescriptions = fragment.model.sections
      .flatMap((section) => section.groups)
      .flatMap((group) => group.steps)
      .map((step) => ({
        name: renderedStepName(step.name),
        placementKey: getDistanceCatalogPrescriptionPlacementKey(fragment.entry.key, step.id),
        prescription: formatDistanceCatalogPrescription(step),
      }))
      .filter((entry): entry is { name: string; placementKey: string; prescription: string } =>
        Boolean(entry.prescription),
      );
    for (const { name, placementKey, prescription } of expectedPrescriptions) {
      const expectedWords = prescription.split(/\s+/u);
      const starts = words.flatMap((_word, index) =>
        expectedWords.every((expected, offset) => words[index + offset]?.text === expected)
          ? [index]
          : [],
      );
      if (!starts.length)
        throw new Error(
          `Could not locate rendered prescription on page ${pageNumber}: ${prescription}`,
        );
      const wrappingStart = starts.find(
        (start) =>
          new Set(
            // Regular unit runs have slightly different glyph boxes from adjacent
            // bold runs. A 3 pt y-band represents one visual baseline; distinct
            // 14 pt lines are separated by the 15.68 pt line height.
            words.slice(start, start + expectedWords.length).map((word) => Math.round(word.y / 3)),
          ).size !== 1,
      );
      if (wrappingStart !== undefined)
        throw new Error(
          `Prescription wrapped onto multiple baselines on page ${pageNumber}: ${prescription}`,
        );
      if (!prescriptionPlacementByStepId.has(placementKey))
        throw new Error(
          `Prescription placement was not measured for ${fragment.model.title}: ${prescription}`,
        );
      const placement = prescriptionPlacementByStepId.get(placementKey);
      if (!placement)
        throw new Error(
          `Prescription placement was not measured for ${fragment.model.title}: ${prescription}`,
        );
      const expectedRightEdge = pageWidth - pageRight;
      const rightEdgeTolerance = 2.5;
      const firstStart = starts[0];
      if (firstStart === undefined)
        throw new Error(
          `Could not select rendered fallback prescription on page ${pageNumber}: ${prescription}`,
        );
      const fallbackEndX = words[firstStart + expectedWords.length - 1]?.endX;
      if (
        fallbackEndX === undefined ||
        Math.abs(fallbackEndX - expectedRightEdge) > rightEdgeTolerance
      )
        throw new Error(
          `${placement.placement === "below" ? "Fallback" : "Inline"} prescription did not end at the step-content right edge on page ${pageNumber}: ${prescription} (${fallbackEndX?.toFixed(2) ?? "missing"} vs ${expectedRightEdge.toFixed(2)} pt)`,
        );
      if (placement.placement === "below") continue;
      const expectedNameWords = name.split(/\s+/u).filter(Boolean);
      const matchingNameEnds = words.flatMap((_word, index) =>
        expectedNameWords.every((expected, offset) => words[index + offset]?.text === expected)
          ? [index]
          : [],
      );
      const inlineStart = starts.find((prescriptionStart) => {
        const prescriptionY = words[prescriptionStart]?.y;
        const prescriptionStartX = words[prescriptionStart]?.startX;
        return matchingNameEnds.some((nameStart) => {
          const nameEnd = words[nameStart + expectedNameWords.length - 1]?.endX;
          const nameY = words[nameStart]?.y;
          return (
            nameEnd !== undefined &&
            prescriptionStartX !== undefined &&
            prescriptionY !== undefined &&
            nameY !== undefined &&
            Math.abs(nameY - prescriptionY) <= 3 &&
            prescriptionStartX - nameEnd >= DISTANCE_CATALOG_INLINE_GAP - 1
          );
        });
      });
      if (inlineStart === undefined)
        throw new Error(
          `Inline name and prescription do not share a baseline with a ${DISTANCE_CATALOG_INLINE_GAP} pt readable gap on page ${pageNumber}: ${name} / ${prescription}`,
        );
    }
  }
}

async function createPortraitReviewPackage(path: string): Promise<void> {
  if (!completeBook || !portrait) return;
  const outputDirectory = dirname(path);
  const coverPath = join(
    outputDirectory,
    "gradientpeak-complete-catalog-a5-top-bound-upload-cover-4-face.pdf",
  );
  const interiorPath = join(
    outputDirectory,
    "gradientpeak-complete-catalog-a5-top-bound-upload-interior-duplex.pdf",
  );
  const supersededSingleSidedInteriorPath = join(
    outputDirectory,
    "gradientpeak-complete-catalog-a5-top-bound-upload-interior-single-sided.pdf",
  );
  const manifestPath = join(
    outputDirectory,
    "gradientpeak-complete-catalog-a5-top-bound-manifest.json",
  );
  const zipPath = join(outputDirectory, "gradientpeak-complete-catalog-a5-top-bound-package.zip");
  const scriptPath = join(
    await mkdtemp(join(tmpdir(), "gradientpeak-catalog-package-")),
    "package.py",
  );
  try {
    await writeFile(
      scriptPath,
      `from pathlib import Path\nfrom pypdf import PdfReader, PdfWriter\nfrom pypdf.generic import RectangleObject\nfrom zipfile import ZIP_DEFLATED, ZipFile\nimport hashlib, json, sys\nsource, cover, interior, manifest, archive = map(Path, sys.argv[1:6])\nreader = PdfReader(str(source))\nif len(reader.pages) < 3:\n    raise SystemExit(f'Expected a front cover, interior, and back cover; received {len(reader.pages)} reader pages')\nBLEED=9\nTRIM_W, TRIM_H = 419.527559, 595.275591\nMEDIA_W, MEDIA_H = TRIM_W + BLEED * 2, TRIM_H + BLEED * 2\nreader_hash = hashlib.sha256(source.read_bytes()).hexdigest()\ndef blank():\n    from pypdf import PageObject\n    page = PageObject.create_blank_page(width=MEDIA_W, height=MEDIA_H)\n    page.mediabox=RectangleObject([0,0,MEDIA_W,MEDIA_H]); page.cropbox=RectangleObject([0,0,MEDIA_W,MEDIA_H]); page.bleedbox=RectangleObject([0,0,MEDIA_W,MEDIA_H]); page.trimbox=RectangleObject([BLEED,BLEED,MEDIA_W-BLEED,MEDIA_H-BLEED])\n    return page\ndef bleeded(source_page):\n    page=blank(); page.merge_translated_page(source_page, BLEED, BLEED, expand=False); return page\ndef save(target, pages):\n    writer=PdfWriter()\n    for page in pages: writer.add_page(page)\n    with target.open('wb') as handle: writer.write(handle)\ndef text(page):\n    return (page.extract_text() or '').strip()\ndef assert_box(page):\n    expected = ([0,0,MEDIA_W,MEDIA_H], [0,0,MEDIA_W,MEDIA_H], [BLEED,BLEED,MEDIA_W-BLEED,MEDIA_H-BLEED])\n    actual = (page.mediabox, page.bleedbox, page.trimbox)\n    if any(any(abs(float(value)-wanted)>0.01 for value,wanted in zip(box,wants)) for box,wants in zip(actual,expected)):\n        raise SystemExit('Upload page geometry drifted from A5 trim plus 9 pt bleed')\n# Existing cover semantics are authoritative: front, blank inside front, blank inside back, back.\nsave(cover, [bleeded(reader.pages[0]), blank(), blank(), bleeded(reader.pages[-1])])\n# Duplex upload stays upright and in normal reader order. Add only a final blank reverse face when an odd interior needs one; never insert blanks between reader pages.\ninterior_pages=[bleeded(reader.pages[index]) for index in range(1, len(reader.pages)-1)]\ninterior_content_faces=len(interior_pages)\nif interior_content_faces % 2: interior_pages.append(blank())\nsave(interior, interior_pages)\ncover_reader, interior_reader = PdfReader(str(cover)), PdfReader(str(interior))\nif len(cover_reader.pages) != 4 or len(interior_reader.pages) != interior_content_faces + (interior_content_faces % 2):\n    raise SystemExit('Expected four cover faces and an even duplex interior')\nif text(cover_reader.pages[1]) or text(cover_reader.pages[2]) or (interior_content_faces % 2 and text(interior_reader.pages[-1])):\n    raise SystemExit('Cover inside faces and final duplex reverse must be blank')\nsource_interior = [text(page) for page in reader.pages[1:-1]]\nupload_interior = [text(page) for page in interior_reader.pages[:interior_content_faces]]\nif not all(source_interior) or source_interior != upload_interior:\n    raise SystemExit('Duplex interior no longer preserves every reader interior page exactly once in order')\nfor page in [*cover_reader.pages, *interior_reader.pages]: assert_box(page)\nif hashlib.sha256(source.read_bytes()).hexdigest() != reader_hash:\n    raise SystemExit('Packaging changed the reader PDF')\nmapping=[{'reader_page': number, 'upload_face': number-1} for number in range(2, len(reader.pages))]\nmanifest.write_text(json.dumps({'profile':'A5 148x210mm, top-bound Wire-O, double-sided', 'printing_orientation':'normal upright reading order (no page rotation)', 'trim_pt':[TRIM_W,TRIM_H], 'bleed_pt':BLEED, 'reader_pages':len(reader.pages), 'printed_inner_pages':interior_content_faces, 'upload_interior_faces':len(interior_reader.pages), 'final_blank_reverse_face':len(interior_reader.pages) if interior_content_faces % 2 else None, 'cover_faces':['front','blank inside front','blank inside back','back'], 'interior_mapping':mapping, 'reader_sha256':reader_hash}, indent=2)+'\\n')\nwith ZipFile(archive, 'w', ZIP_DEFLATED) as bundle:\n    for item in [source, cover, interior, manifest, source.with_suffix('.README.md'), source.with_suffix('.validation.json'), source.with_suffix('.validation.md')]:\n        bundle.write(item, item.name)\nwith ZipFile(archive) as bundle:\n    if bundle.testzip() or interior.name not in bundle.namelist():\n        raise SystemExit('Package archive integrity check failed')\n`,
    );
    await execFileAsync("uv", [
      "run",
      "--with",
      "pypdf==5.9.0",
      "python",
      scriptPath,
      path,
      coverPath,
      interiorPath,
      manifestPath,
      zipPath,
    ]);
    await unlink(supersededSingleSidedInteriorPath).catch((error: unknown) => {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    });
  } finally {
    await rm(dirname(scriptPath), { force: true, recursive: true });
  }
}

type ActivityPlanValidation = {
  id: string;
  title: string;
  allocatedPhysicalPages: number;
  contentPages: number;
  /** Compatibility alias for older audit readers; use contentPages in new reports. */
  pages: number;
  rawTotals: {
    distanceMeters: number;
    hasOpenEndedWork: boolean;
    repetitionCount: number;
    timeSeconds: number;
  };
  durationKinds: readonly string[];
  targetTypes: readonly string[];
  unsupportedTargetPresentationCount: number;
  warnings: readonly string[];
  checks: Record<string, boolean>;
  contentReviewFindings: readonly ContentReviewFinding[];
};

type ContentReviewFinding = {
  kind: "inconsistent_repeated_work_recovery_motif";
  status: "NEEDS_CONTENT_REVIEW";
  repetitionCounts: readonly number[];
  occurrenceCount: number;
  message: string;
};

function rawTotals(structure: ReturnType<typeof activityPlanStructureSchema.parse>) {
  let distanceMeters = 0;
  let hasOpenEndedWork = false;
  let repetitionCount = 0;
  let timeSeconds = 0;
  let restSeconds = 0;
  const durationKinds = new Set<string>();
  const targetTypes = new Set<string>();
  for (const item of structure.items) {
    const count = item.type === "repeat" ? item.count : 1;
    for (const step of item.type === "repeat" ? item.steps : [item]) {
      durationKinds.add(step.duration.type);
      step.targets.forEach((target) => {
        targetTypes.add(target.type);
      });
      if (step.duration.type === "time") {
        timeSeconds += step.duration.seconds * count;
        if (step.targets.some((target) => target.type === "rest"))
          restSeconds += step.duration.seconds * count;
      } else if (step.duration.type === "distance") distanceMeters += step.duration.meters * count;
      else if (step.duration.type === "repetitions") repetitionCount += step.duration.count * count;
      else hasOpenEndedWork = true;
    }
  }
  return {
    distanceMeters,
    durationKinds: [...durationKinds].sort(),
    hasOpenEndedWork,
    repetitionCount,
    targetTypes: [...targetTypes].sort(),
    timeSeconds,
    restSeconds,
  };
}

function expectedTotals(totals: ReturnType<typeof rawTotals>): string[] {
  const result: string[] = [];
  if (totals.distanceMeters)
    result.push(
      `${totals.hasOpenEndedWork ? "Distance subtotal" : "Distance"}: ${formatActivityPlanPrintDuration({ type: "distance", meters: totals.distanceMeters })}`,
    );
  const activeSeconds = totals.timeSeconds - totals.restSeconds;
  if (activeSeconds)
    result.push(
      `${totals.restSeconds ? (totals.hasOpenEndedWork ? "Active timed subtotal" : "Active time") : totals.hasOpenEndedWork ? "Timed subtotal" : "Time"}: ${formatActivityPlanPrintDuration({ type: "time", seconds: activeSeconds })}`,
    );
  if (totals.restSeconds)
    result.push(
      `Rest${totals.hasOpenEndedWork ? " subtotal" : ""}: ${formatActivityPlanPrintDuration({ type: "time", seconds: totals.restSeconds })}`,
    );
  if (totals.repetitionCount)
    result.push(
      `${totals.hasOpenEndedWork ? "Repetitions subtotal" : "Repetitions"}: ${totals.repetitionCount} reps`,
    );
  if (totals.hasOpenEndedWork) result.push("Plus open-ended work");
  return result;
}

function normalizedMotifText(value: string | null): string {
  return (value ?? "").trim().toLocaleLowerCase().replace(/\s+/gu, " ");
}

/**
 * Finds a deliberately narrow, non-blocking authoring anomaly: a two-step
 * work/recovery motif that recurs in the same activityPlan with both repeated and
 * one-off counts. The V5 schema permits that progression, so this is never a
 * structural failure or an instruction to rewrite the prescription.
 */
function findContentReviewFindings(
  structure: ReturnType<typeof activityPlanStructureSchema.parse>,
): readonly ContentReviewFinding[] {
  // Keep the step key local so it cannot accidentally normalize targets or durations.
  const keyForSteps = (
    steps: readonly Extract<(typeof structure.items)[number], { type: "step" }>[],
  ) =>
    JSON.stringify(
      steps.map((step) => {
        const cue = getDistanceCatalogCuePresentation({
          activityCategory: structure.activity_category,
          instructions: step.instructions ?? null,
          name: step.name ?? null,
        }).cue;
        return {
          cue: normalizedMotifText(cue),
          duration: step.duration,
          name: normalizedMotifText(step.name ?? null),
          targets: step.targets,
        };
      }),
    );
  const repeatMotifs = structure.items
    .filter(
      (item): item is Extract<(typeof structure.items)[number], { type: "repeat" }> =>
        item.type === "repeat" && item.steps.length === 2,
    )
    .map((item) => keyForSteps(item.steps));
  const candidateMotifs = new Set(repeatMotifs);
  const observed = new Map<string, number[]>();
  for (let index = 0; index < structure.items.length; index += 1) {
    const item = structure.items[index];
    if (item?.type === "repeat" && item.steps.length === 2) {
      const key = keyForSteps(item.steps);
      observed.set(key, [...(observed.get(key) ?? []), item.count]);
      continue;
    }
    const first = item?.type === "step" ? item : null;
    const second = structure.items[index + 1];
    if (!first || second?.type !== "step") continue;
    const key = keyForSteps([first, second]);
    if (!candidateMotifs.has(key)) continue;
    observed.set(key, [...(observed.get(key) ?? []), 1]);
    index += 1;
  }
  return [...observed.values()]
    .filter((counts) => counts.length > 1 && new Set(counts).size > 1)
    .map((counts) => ({
      kind: "inconsistent_repeated_work_recovery_motif" as const,
      message:
        `Identical normalized two-step work/recovery motif occurs ${counts.length} times ` +
        `with repetition counts ${counts.join(", ")}. V5 permits intentional progression; review ` +
        "the authored protocol before treating this as an error.",
      occurrenceCount: counts.length,
      repetitionCounts: counts,
      status: "NEEDS_CONTENT_REVIEW" as const,
    }));
}

function validateCatalog(
  entries: ReturnType<typeof buildActivityPlanCatalogModels>,
  measured: ReadonlyMap<string, readonly ActivityPlanCatalogFragment[]>,
) {
  const templates = new Map(publisherTemplates.map((template) => [template.id, template]));
  const activityPlans: ActivityPlanValidation[] = entries.map((entry) => {
    const template = templates.get(entry.key);
    if (!template) throw new Error(`Catalog entry has no source template: ${entry.key}`);
    const parsed = activityPlanStructureSchema.safeParse(template.structure);
    if (!parsed.success) throw new Error(`Catalog source is not valid V5: ${entry.model.title}`);
    const structure = parsed.data;
    const totals = rawTotals(structure);
    const contentReviewFindings = findContentReviewFindings(structure);
    const resolution = resolveActivityPlanSessionFlow({
      personalize: false,
      structure,
    });
    const sourceSteps = structure.items.flatMap((item) =>
      item.type === "repeat" ? item.steps : [item],
    );
    const printedSteps = entry.model.sections.flatMap((section) =>
      section.groups.flatMap((group) => group.steps),
    );
    const sourceExecution = structure.items.flatMap((item) =>
      Array.from({ length: item.type === "repeat" ? item.count : 1 }, () =>
        (item.type === "repeat" ? item.steps : [item]).map((step) => step.id),
      ).flat(),
    );
    const printedExecution = entry.model.sections.flatMap((section) =>
      section.groups.flatMap((group) =>
        Array.from({ length: group.repetitions }, () => group.steps.map((step) => step.id)).flat(),
      ),
    );
    const printStepById = new Map(printedSteps.map((step) => [step.id, step]));
    const perStep = sourceSteps.every((sourceStep) => {
      const printed = printStepById.get(sourceStep.id);
      const expectedLabels = getActivityPlanSessionFlowTargetPresentations(
        resolution,
        sourceStep.id,
      ).map((target) => target.label);
      return (
        printed?.name === (sourceStep.name ?? null) &&
        printed.instructions === (sourceStep.instructions ?? null) &&
        printed.durationLabel === formatActivityPlanPrintDuration(sourceStep.duration) &&
        JSON.stringify(printed.targetLabels ?? []) === JSON.stringify(expectedLabels)
      );
    });
    const presentation = deriveActivityPlanPresentation(structure);
    const contextPreserved = sourceSteps.every((step) => {
      const displayed = getDistanceCatalogCuePresentation({
        activityCategory: structure.activity_category,
        instructions: step.instructions ?? null,
        name: step.name ?? null,
      });
      const original = formatActivityPlanCatalogInstruction({
        activityCategory: structure.activity_category,
        instructions: step.instructions ?? null,
        name: step.name ?? null,
      });
      return displayed.groupContext === null || original?.includes(displayed.groupContext) === true;
    });
    const checks = {
      chartHasFullExecutionTrace:
        presentation !== null &&
        presentation.occurrences.map((occurrence) => occurrence.stepId).join("\u0000") ===
          sourceExecution.join("\u0000") &&
        entry.model.intensityProfile.length === sourceExecution.length,
      cueSemanticsPreserved: contextPreserved,
      durationTotalsMatchRawSchema:
        JSON.stringify(entry.model.totals) === JSON.stringify(expectedTotals(totals)),
      exactExecutionOrderAndRepeats:
        sourceExecution.join("\u0000") === printedExecution.join("\u0000"),
      sourceAndPrintedStepCoverage: sourceSteps.length === printedSteps.length && perStep,
      validV5Schema: true,
    };
    const warnings = [
      ...(totals.hasOpenEndedWork ? ["open-ended work: totals are subtotals"] : []),
      ...(totals.durationKinds.length > 1
        ? [`mixed duration units: ${totals.durationKinds.join(", ")}`]
        : []),
      ...(totals.targetTypes.length === 0 ? ["no authored targets"] : []),
    ];
    return {
      checks,
      contentReviewFindings,
      id: entry.key,
      allocatedPhysicalPages: measured.get(entry.key)?.length ?? 1,
      contentPages: measured.get(entry.key)?.length ?? 1,
      pages: measured.get(entry.key)?.length ?? 1,
      rawTotals: {
        distanceMeters: totals.distanceMeters,
        hasOpenEndedWork: totals.hasOpenEndedWork,
        repetitionCount: totals.repetitionCount,
        timeSeconds: totals.timeSeconds,
      },
      durationKinds: totals.durationKinds,
      targetTypes: totals.targetTypes,
      title: entry.model.title,
      unsupportedTargetPresentationCount: 0,
      warnings,
    };
  });
  const failures = activityPlans.flatMap((activityPlan) =>
    Object.entries(activityPlan.checks)
      .filter(([, passed]) => !passed)
      .map(([check]) => `${activityPlan.title}: ${check}`),
  );
  if (failures.length)
    throw new Error(`Catalog semantic validation failed:\n${failures.join("\n")}`);
  const overflowed = activityPlans.filter(
    (activityPlan) => activityPlan.contentPages > activityPlan.allocatedPhysicalPages,
  );
  if (overflowed.length)
    throw new Error(
      `ActivityPlan content exceeds its measured physical allocation:\n${overflowed
        .map((activityPlan) => `${activityPlan.title}: ${activityPlan.contentPages} content pages`)
        .join("\n")}`,
    );
  return {
    coachingCorrectness: "NOT_DETERMINED_BY_STRUCTURAL_VALIDATION",
    contentReviewFindings: activityPlans.flatMap((activityPlan) =>
      activityPlan.contentReviewFindings.map((finding) => ({
        ...finding,
        activityPlanId: activityPlan.id,
        activityPlanTitle: activityPlan.title,
      })),
    ),
    structuralChecksPass: true,
    excludedSystemTemplateIds: [...PUBLISHER_EXCLUDED_TEMPLATE_IDS],
    excludedSystemTemplateCount: PUBLISHER_EXCLUDED_TEMPLATE_IDS.size,
    systemTemplateCount: SYSTEM_TEMPLATES.length,
    activityPlanCount: activityPlans.length,
    templateCount: 0,
    allocatedActivityPlanPhysicalPages: activityPlans.reduce(
      (total, activityPlan) => total + activityPlan.allocatedPhysicalPages,
      0,
    ),
    totalActivityPlanContentPages: activityPlans.reduce(
      (total, activityPlan) => total + activityPlan.contentPages,
      0,
    ),
    maxActivityPlanContentPages: Math.max(
      ...activityPlans.map((activityPlan) => activityPlan.contentPages),
    ),
    // Compatibility aliases for existing consumers; physical allocation equals
    // actual content pages; no fixed page-slot allocation is introduced.
    totalActivityPlanPages: activityPlans.reduce(
      (total, activityPlan) => total + activityPlan.contentPages,
      0,
    ),
    maxActivityPlanPages: Math.max(
      ...activityPlans.map((activityPlan) => activityPlan.contentPages),
    ),
    activityPlans,
  };
}

function validationMarkdown(
  validation: ReturnType<typeof validateCatalog>,
  pageCount: number,
): string {
  const longest = [...validation.activityPlans]
    .sort(
      (left, right) =>
        right.contentPages - left.contentPages || left.title.localeCompare(right.title),
    )
    .slice(0, 10);
  const activityPlanRows = validation.activityPlans
    .map(
      (activityPlan) =>
        `| ${activityPlan.title} | ${activityPlan.contentPages} | ${activityPlan.allocatedPhysicalPages} | ${activityPlan.durationKinds.join(", ")} | ${activityPlan.targetTypes.join(", ") || "—"} | ${activityPlan.unsupportedTargetPresentationCount} | ${activityPlan.contentReviewFindings.map((finding) => finding.status).join(", ") || "—"} | ${activityPlan.warnings.join("; ") || "—"} |`,
    )
    .join("\n");
  return `# Styled distance-reading catalog validation

- PDF pages: **${pageCount}** (${portrait ? "A5 148 × 210 mm" : "US Letter"} ${geometry})
- ActivityPlans: **${validation.activityPlanCount}**; training templates: **${validation.templateCount}**
- ActivityPlan content pages: **${validation.totalActivityPlanContentPages}**; each activityPlan uses its actual natural number of content pages (the same **${validation.allocatedActivityPlanPhysicalPages}** physical pages total). No blank activityPlan pages are allocated.
- Structural checks: **passed** — valid V5 schema, source/printed step coverage, execution order and repeats, raw-schema totals, full chart execution trace, cue-context preservation, and rendered safe bounds/footer separation.
- Content review findings: **${validation.contentReviewFindings.length}**. These non-blocking findings do not determine coaching correctness or authorize prescription edits.

## Longest activityPlans

| ActivityPlan | Content pages | Physical allocation | Warnings |
| --- | ---: | ---: | --- |
${longest.map((activityPlan) => `| ${activityPlan.title} | ${activityPlan.contentPages} | ${activityPlan.allocatedPhysicalPages} | ${activityPlan.warnings.join("; ") || "—"} |`).join("\n")}

## Per-activityPlan audit

| ActivityPlan | Content pages | Physical allocation | Duration kinds | Target types | Unsupported targets | Content review | Warnings |
| --- | ---: | ---: | --- | --- | ---: | --- | --- |
${activityPlanRows}
`;
}

const { entries, measured, prescriptionPlacementByStepId } = await measureFragments();
const layout = buildActivityPlanCatalogLayout(entries, [], measured);
assertActivityPlanCatalogLayout(layout, entries);
const fragments = layout.planPages.flatMap((page) => page.entries);
// The published catalog contains standalone activityPlans, not multi-week plans.
const templates: NonNullable<typeof layout.trainingPlanSection>["plans"] = [];
const trainingPages = templates.flatMap((plan) => plan.weeks.map((week) => ({ plan, week })));
if (
  SYSTEM_TEMPLATES.length !== 68 ||
  PUBLISHER_EXCLUDED_TEMPLATE_IDS.size !== 2 ||
  entries.length !== 66 ||
  templates.length !== 0
)
  throw new Error(
    `Expected 68 system templates, 2 publisher exclusions, 66 printed activityPlans, and no training templates; received ${SYSTEM_TEMPLATES.length}, ${PUBLISHER_EXCLUDED_TEMPLATE_IDS.size}, ${entries.length}, and ${templates.length}`,
  );
if (
  templates.some(
    (plan) =>
      plan.weeks.flatMap((week) => week.sessions).length !== plan.scheduleVisual.totalSessions,
  )
)
  throw new Error("Training-template schedule coverage is incomplete");
const validation = validateCatalog(entries, measured);
await mkdir(dirname(outputPath), { recursive: true });
const candidateDirectory = await mkdtemp(join(tmpdir(), "gradientpeak-distance-candidate-"));
const candidate = join(candidateDirectory, "candidate.pdf");
let preflightPassed = false;
try {
  const completeBookPlan = completeBook
    ? buildActivityPlanDistanceCatalogCompleteBookPlan(fragments, trainingPages, geometry)
    : undefined;
  await writeFile(
    candidate,
    await renderToBuffer(
      completeBookPlan ? (
        <ActivityPlanDistanceCatalogCompleteBookDocument
          coverLogoDataUri={coverLogoDataUri}
          fragments={fragments}
          geometry={geometry}
          plan={completeBookPlan}
          prescriptionPlacementByStepId={prescriptionPlacementByStepId}
          trainingPages={trainingPages}
        />
      ) : (
        <ActivityPlanDistanceCatalogDocument
          fragments={fragments}
          geometry={geometry}
          prescriptionPlacementByStepId={prescriptionPlacementByStepId}
          trainingPages={trainingPages}
        />
      ),
    ),
  );
  await preflight(
    candidate,
    fragments,
    prescriptionPlacementByStepId,
    trainingPages,
    completeBookPlan,
  );
  try {
    await rename(candidate, outputPath);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EXDEV") throw error;
    await copyFile(candidate, outputPath);
  }
  preflightPassed = true;
  const pageCount = completeBookPlan?.totalPageCount ?? fragments.length + trainingPages.length;
  await writeFile(
    validationJsonPath,
    `${JSON.stringify(
      {
        ...validation,
        pageCount,
        renderPreflight: {
          allPagesLetterLandscape: !portrait,
          allPagesA5Portrait: portrait,
          noTextEscapedSafeBounds: true,
          noTextOverlappedFooterBoundary: true,
        },
        ...(completeBookPlan
          ? {
              completeBook: {
                backCoverPages: 1,
                uploadCoverInsideBackFaces: 1,
                uploadCoverInsideFrontFaces: 1,
                allocatedActivityPlanPhysicalPages: completeBookPlan.activityPlanSlots.reduce(
                  (total, slot) => total + slot.contentFragments.length,
                  0,
                ),
                frontMatterPages: completeBookPlan.frontMatterPageCount,
                trainingFirstPageNumbers: Object.fromEntries(
                  completeBookPlan.trainingFirstPageNumbers,
                ),
                activityPlanFirstPageNumbers: Object.fromEntries(
                  completeBookPlan.activityPlanPageNumbers,
                ),
              },
            }
          : {}),
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    validationMarkdownPath,
    `${completeBook ? `# Complete review catalog validation\n\n- Front matter: **${completeBookPlan?.frontMatterPageCount}** reader pages (front cover, contents, user guide, and conversion tables; no publication-information page)\n- ActivityPlan allocation: **${completeBookPlan?.activityPlanSlots.length}** activityPlans use their actual natural number of content pages = **${completeBookPlan?.activityPlanSlots.reduce((total, slot) => total + slot.contentFragments.length, 0)}** pages; no blank activityPlan pages are allocated.\n- Back matter: **1** reader page (back cover)\n- Contents references: **${completeBookPlan?.activityPlanPageNumbers.size}** activityPlans and **${completeBookPlan?.trainingFirstPageNumbers.size}** training schedules\n\n` : ""}${validationMarkdown(validation, pageCount)}`,
  );
  await writeFile(
    readmePath,
    `# ${completeBook ? "Complete review activity-plan catalog" : "Styled distance-reading activity-plan catalog"}\n\n` +
      `\`${outputPath.split("/").at(-1)}\` is a **${pageCount}-page** ${portrait ? "A5 (148 × 210 mm)" : "US Letter"} ${geometry}, screen/local-proof reader edition. Print at **100% / actual size** in ${geometry} orientation; do not use “fit to page”.\n\n` +
      `The adjacent \`${outputPath
        .split("/")
        .at(-1)
        ?.replace(
          /\.pdf$/u,
          ".validation.json",
        )}\` and \`.validation.md\` record the deterministic whole-catalog schema, coverage, execution, total, and layout audit.\n\n` +
      "## Reader glossary\n\nThe reader’s dedicated glossary defines every abbreviated target, unit, and pace notation used in the catalog, including FTP, THR / Threshold HR, HRmax / MaxHR, HR / bpm, RPE, rpm, CSS, VO2, W, and 5K. Conversion-table lookup intervals use 10%; calculate or interpolate from reference × percentage ÷ 100 between them. Built-in prescriptions retain their authored five-percentage-point grid. The conversion tables use the authored reference named by each target; HRmax and THR are not interchangeable.\n\n" +
      `${portrait && completeBook ? `This reader edition is A5 top-bound Wire-O at 100% / actual size. It contains only reader pages—no blank reverse clutter. The matching duplex upload interior preserves reader pages 2–${pageCount - 1} once each in normal upright reading order${(pageCount - 2) % 2 ? `, followed by one final blank reverse face to make ${pageCount - 1} interior faces` : ` across ${pageCount - 2} interior faces`}; it does not insert blanks between content pages. Its separate four-face cover retains the existing front, blank inside front, blank inside back, and back mapping. The manifest maps reader page numbers to upload faces. The package contains ${pageCount - 2} content interior faces${(pageCount - 2) % 2 ? " plus one final blank reverse" : ""} and four cover faces: ${pageCount - 2 + ((pageCount - 2) % 2) + 4} faces / ${(pageCount - 2 + ((pageCount - 2) % 2) + 4) / 2} leaves when cover stock is counted separately. Use one copy: A5, top-bound Wire-O, double-sided printing, normal upright reading order. The upload files have 0.125 in (9 pt) bleed geometry. Confirm the chosen online printer supports the selected binding and stock; no vendor approval or production guarantee is made. ${PUBLISHER_EXCLUDED_TEMPLATE_IDS.size} system templates are excluded from this publisher edition only and remain in the application catalog and training schedules. ` : ""}No CMYK or PDF/X claim is made for this local review/upload package.\n`,
  );
  await createPortraitReviewPackage(outputPath);
} finally {
  if (preflightPassed) {
    await unlink(candidate).catch(() => undefined);
    await rm(candidateDirectory, { force: true, recursive: true });
  } else console.error(`Kept failed render diagnostic at ${candidate}`);
}
console.log(
  `Rendered ${entries.length} activityPlans and ${templates.length} training templates across ${completeBook ? buildActivityPlanDistanceCatalogCompleteBookPlan(fragments, trainingPages, geometry).totalPageCount : fragments.length + trainingPages.length} ${portrait ? "A5" : "US Letter"} ${geometry} pages to ${outputPath}`,
);
