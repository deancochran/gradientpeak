import { normalizeSystemRouteTemplateId } from "./template-ids";

export type SystemRouteActivityCategory = "run" | "bike" | "other";

export type SystemRouteArchiveFormat = "gpx" | "zip";

export interface SystemRouteTemplate {
  activity_category: SystemRouteActivityCategory;
  description: string;
  id: string;
  import_external_id: string;
  name: string;
  source_archive_format: SystemRouteArchiveFormat;
  source_attribution?: string | null;
  source_download_url: string;
  source_license?: string | null;
  source_page_url: string;
  source_provider: string;
  tags?: readonly string[];
}

function createSystemRouteTemplate(
  input: Omit<SystemRouteTemplate, "id"> & { id?: string },
): SystemRouteTemplate {
  return {
    ...input,
    id: normalizeSystemRouteTemplateId({
      id: input.id,
      activityCategory: input.activity_category,
      name: input.name,
    }),
  };
}

const runningRoutesAttribution = "Thomas Turrell-Croft / Running Routes";
const gpxAdventuresAttribution = "GPX Adventures";

export const SYSTEM_ROUTE_TEMPLATES: SystemRouteTemplate[] = [
  createSystemRouteTemplate({
    activity_category: "run",
    description:
      "Legendary Lake District fell-running challenge covering 42 peaks in a single simplified GPX track.",
    import_external_id: "running-routes:bob-graham-round:simplified",
    name: "Bob Graham Round",
    source_archive_format: "gpx",
    source_attribution: runningRoutesAttribution,
    source_download_url:
      "https://thomasturrell.github.io/running-routes/assets/gpx/fell/bob-graham-round/bob-graham-round-simplified.gpx",
    source_page_url: "https://thomasturrell.github.io/running-routes/fell/bob-graham-round/",
    source_provider: "running-routes",
    tags: ["fell", "mountain", "ultra", "challenge"],
  }),
  createSystemRouteTemplate({
    activity_category: "run",
    description:
      "Classic Scottish 24-hour mountain round through Lochaber, published as a simplified GPX route.",
    import_external_id: "running-routes:ramsay-round:simplified",
    name: "Ramsay Round",
    source_archive_format: "gpx",
    source_attribution: runningRoutesAttribution,
    source_download_url:
      "https://thomasturrell.github.io/running-routes/assets/gpx/fell/ramsay-round/ramsay-round-simplified.gpx",
    source_page_url: "https://thomasturrell.github.io/running-routes/fell/ramsay-round/",
    source_provider: "running-routes",
    tags: ["fell", "mountain", "ultra", "challenge"],
  }),
  createSystemRouteTemplate({
    activity_category: "run",
    description:
      "Snowdonia's iconic Paddy Buckley Round captured as a simplified point-to-point challenge GPX.",
    import_external_id: "running-routes:paddy-buckley-round:simplified",
    name: "Paddy Buckley Round",
    source_archive_format: "gpx",
    source_attribution: runningRoutesAttribution,
    source_download_url:
      "https://thomasturrell.github.io/running-routes/assets/gpx/fell/paddy-buckley-round/paddy-buckley-round-simplified.gpx",
    source_page_url: "https://thomasturrell.github.io/running-routes/fell/paddy-buckley-round/",
    source_provider: "running-routes",
    tags: ["fell", "mountain", "ultra", "challenge"],
  }),
  createSystemRouteTemplate({
    activity_category: "run",
    description:
      "Road marathon race course through Manchester, published as a simplified GPX for race-day previews.",
    import_external_id: "running-routes:manchester-marathon-2026:simplified",
    name: "Manchester Marathon 2026",
    source_archive_format: "gpx",
    source_attribution: runningRoutesAttribution,
    source_download_url:
      "https://thomasturrell.github.io/running-routes/assets/gpx/road/manchester-marathon-2026/manchester-marathon-2026-simplified.gpx",
    source_page_url:
      "https://thomasturrell.github.io/running-routes/road/manchester-marathon-2026/",
    source_provider: "running-routes",
    tags: ["road", "marathon", "race-course"],
  }),
  createSystemRouteTemplate({
    activity_category: "run",
    description:
      "Fast Inverness city-centre half marathon route published as a simplified GPX course.",
    import_external_id: "running-routes:inverness-half-marathon:simplified",
    name: "Inverness Half Marathon",
    source_archive_format: "gpx",
    source_attribution: runningRoutesAttribution,
    source_download_url:
      "https://thomasturrell.github.io/running-routes/assets/gpx/road/inverness-half-marathon/inverness-half-marathon-simplified.gpx",
    source_page_url: "https://thomasturrell.github.io/running-routes/road/inverness-half-marathon/",
    source_provider: "running-routes",
    tags: ["road", "half-marathon", "race-course"],
  }),
  createSystemRouteTemplate({
    activity_category: "bike",
    description:
      "Eifel mountain-bike loop near Raeren with technical off-road terrain, distributed as a downloadable GPX zip.",
    import_external_id: "gpx-adventures:mtb-raeren",
    name: "Raeren Eifel MTB Ride",
    source_archive_format: "zip",
    source_attribution: gpxAdventuresAttribution,
    source_download_url:
      "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2023/04/GPXadventures-MTB-raeren.gpx_.zip",
    source_page_url: "https://gpxadventures.com/mtb/",
    source_provider: "gpx-adventures",
    tags: ["mtb", "off-road", "forest"],
  }),
  createSystemRouteTemplate({
    activity_category: "bike",
    description:
      "Winter mountain-bike route through Naturpark Eifel, published as a zipped GPX trail file.",
    import_external_id: "gpx-adventures:naturpark-eifel-de",
    name: "Naturpark Eifel MTB Tour",
    source_archive_format: "zip",
    source_attribution: gpxAdventuresAttribution,
    source_download_url:
      "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2022/02/Naturpark-Eifel-DE.gpx_.zip",
    source_page_url: "https://gpxadventures.com/mtb/",
    source_provider: "gpx-adventures",
    tags: ["mtb", "off-road", "forest"],
  }),
  createSystemRouteTemplate({
    activity_category: "bike",
    description:
      "Scenic Cap Blanc Nez summer mountain-bike route published as a zipped GPX course.",
    import_external_id: "gpx-adventures:cap-blanc-nez",
    name: "Cap Blanc Nez MTB Ride",
    source_archive_format: "zip",
    source_attribution: gpxAdventuresAttribution,
    source_download_url:
      "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2022/09/Cap-blanc-nez.gpx_.zip",
    source_page_url: "https://gpxadventures.com/mtb/",
    source_provider: "gpx-adventures",
    tags: ["mtb", "coastal", "off-road"],
  }),
  createSystemRouteTemplate({
    activity_category: "other",
    description: "Short canyon hike in Belgium with a public zipped GPX file for the full route.",
    import_external_id: "gpx-adventures:tros-marets",
    name: "Tros Marets Canyon Hike",
    source_archive_format: "zip",
    source_attribution: gpxAdventuresAttribution,
    source_download_url:
      "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2023/04/GPX-Adventures-Tros-Marets.gpx_.zip",
    source_page_url: "https://gpxadventures.com/hiking-trails/",
    source_provider: "gpx-adventures",
    tags: ["hike", "canyon", "loop"],
  }),
  createSystemRouteTemplate({
    activity_category: "other",
    description:
      "Classic Zermatt-area hike linking the Matterhorn five lakes, distributed as a zipped GPX file.",
    import_external_id: "gpx-adventures:matterhorn-5-lakes",
    name: "Matterhorn 5 Lakes Hike",
    source_archive_format: "zip",
    source_attribution: gpxAdventuresAttribution,
    source_download_url:
      "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2021/10/Matterhorn-5-lakes-gpx.zip",
    source_page_url: "https://gpxadventures.com/hiking-trails/",
    source_provider: "gpx-adventures",
    tags: ["hike", "alpine", "loop"],
  }),
  createSystemRouteTemplate({
    activity_category: "other",
    description: "Easy circuit around Lago di Braies, published as a zipped GPX hiking route.",
    import_external_id: "gpx-adventures:lago-di-braies",
    name: "Lago di Braies Loop",
    source_archive_format: "zip",
    source_attribution: gpxAdventuresAttribution,
    source_download_url:
      "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2021/10/Lago-di-braies.gpx_.zip",
    source_page_url: "https://gpxadventures.com/hiking-trails/",
    source_provider: "gpx-adventures",
    tags: ["hike", "lake", "loop"],
  }),
  createSystemRouteTemplate({
    activity_category: "other",
    description:
      "More demanding Dolomites out-and-back hike to Lago di Sorapis, distributed as a zipped GPX route.",
    import_external_id: "gpx-adventures:lago-di-sorapis",
    name: "Lago di Sorapis Hike",
    source_archive_format: "zip",
    source_attribution: gpxAdventuresAttribution,
    source_download_url:
      "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2021/10/Lago-di-sorapis.gpx_.zip",
    source_page_url: "https://gpxadventures.com/hiking-trails/",
    source_provider: "gpx-adventures",
    tags: ["hike", "alpine", "out-and-back"],
  }),
];

export function getSystemRoutesByCategory(
  category: SystemRouteTemplate["activity_category"],
): SystemRouteTemplate[] {
  return SYSTEM_ROUTE_TEMPLATES.filter((route) => route.activity_category === category);
}
