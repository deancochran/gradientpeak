import { normalizeSystemRouteTemplateId } from "./template-ids";

export type SystemRouteArchiveFormat = "gpx" | "zip";

export interface SystemRouteTemplate {
  description: string;
  download_url: string;
  id: string;
  name: string;
  source_archive_format: SystemRouteArchiveFormat;
}

function createSystemRouteTemplate(
  input: Omit<SystemRouteTemplate, "id"> & { id?: string },
): SystemRouteTemplate {
  return {
    ...input,
    id: normalizeSystemRouteTemplateId({
      id: input.id,
      name: input.name,
    }),
  };
}

export const SYSTEM_ROUTE_TEMPLATES: SystemRouteTemplate[] = [
  createSystemRouteTemplate({
    description:
      "Legendary Lake District fell-running challenge covering 42 peaks in a single simplified GPX track.",
    id: "running-routes-bob-graham-round",
    name: "Bob Graham Round",
    source_archive_format: "gpx",
    download_url:
      "https://thomasturrell.github.io/running-routes/assets/gpx/fell/bob-graham-round/bob-graham-round-simplified.gpx",
  }),
  createSystemRouteTemplate({
    description:
      "Classic Scottish 24-hour mountain round through Lochaber, published as a simplified GPX route.",
    id: "running-routes-ramsay-round",
    name: "Ramsay Round",
    source_archive_format: "gpx",
    download_url:
      "https://thomasturrell.github.io/running-routes/assets/gpx/fell/ramsay-round/ramsay-round-simplified.gpx",
  }),
  createSystemRouteTemplate({
    description:
      "Snowdonia's iconic Paddy Buckley Round captured as a simplified point-to-point challenge GPX.",
    id: "running-routes-paddy-buckley-round",
    name: "Paddy Buckley Round",
    source_archive_format: "gpx",
    download_url:
      "https://thomasturrell.github.io/running-routes/assets/gpx/fell/paddy-buckley-round/paddy-buckley-round-simplified.gpx",
  }),
  createSystemRouteTemplate({
    description:
      "Road marathon race course through Manchester, published as a simplified GPX for race-day previews.",
    id: "running-routes-manchester-marathon-2026",
    name: "Manchester Marathon 2026",
    source_archive_format: "gpx",
    download_url:
      "https://thomasturrell.github.io/running-routes/assets/gpx/road/manchester-marathon-2026/manchester-marathon-2026-simplified.gpx",
  }),
  createSystemRouteTemplate({
    description:
      "Fast Inverness city-centre half marathon route published as a simplified GPX course.",
    id: "running-routes-inverness-half-marathon",
    name: "Inverness Half Marathon",
    source_archive_format: "gpx",
    download_url:
      "https://thomasturrell.github.io/running-routes/assets/gpx/road/inverness-half-marathon/inverness-half-marathon-simplified.gpx",
  }),
  createSystemRouteTemplate({
    description:
      "Eifel mountain-bike loop near Raeren with technical off-road terrain, distributed as a downloadable GPX zip.",
    id: "gpx-adventures-mtb-raeren",
    name: "Raeren Eifel MTB Ride",
    source_archive_format: "zip",
    download_url:
      "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2023/04/GPXadventures-MTB-raeren.gpx_.zip",
  }),
  createSystemRouteTemplate({
    description:
      "Winter mountain-bike route through Naturpark Eifel, published as a zipped GPX trail file.",
    id: "gpx-adventures-naturpark-eifel",
    name: "Naturpark Eifel MTB Tour",
    source_archive_format: "zip",
    download_url:
      "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2022/02/Naturpark-Eifel-DE.gpx_.zip",
  }),
  createSystemRouteTemplate({
    description:
      "Scenic Cap Blanc Nez summer mountain-bike route published as a zipped GPX course.",
    id: "gpx-adventures-cap-blanc-nez",
    name: "Cap Blanc Nez MTB Ride",
    source_archive_format: "zip",
    download_url: "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2022/09/Cap-blanc-nez.gpx_.zip",
  }),
  createSystemRouteTemplate({
    description: "Short canyon hike in Belgium with a public zipped GPX file for the full route.",
    id: "gpx-adventures-tros-marets",
    name: "Tros Marets Canyon Hike",
    source_archive_format: "zip",
    download_url:
      "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2023/04/GPX-Adventures-Tros-Marets.gpx_.zip",
  }),
  createSystemRouteTemplate({
    description:
      "Classic Zermatt-area hike linking the Matterhorn five lakes, distributed as a zipped GPX file.",
    id: "gpx-adventures-matterhorn-5-lakes",
    name: "Matterhorn 5 Lakes Hike",
    source_archive_format: "zip",
    download_url:
      "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2021/10/Matterhorn-5-lakes-gpx.zip",
  }),
  createSystemRouteTemplate({
    description: "Easy circuit around Lago di Braies, published as a zipped GPX hiking route.",
    id: "gpx-adventures-lago-di-braies",
    name: "Lago di Braies Loop",
    source_archive_format: "zip",
    download_url:
      "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2021/10/Lago-di-braies.gpx_.zip",
  }),
  createSystemRouteTemplate({
    description:
      "More demanding Dolomites out-and-back hike to Lago di Sorapis, distributed as a zipped GPX route.",
    id: "gpx-adventures-lago-di-sorapis",
    name: "Lago di Sorapis Hike",
    source_archive_format: "zip",
    download_url:
      "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2021/10/Lago-di-sorapis.gpx_.zip",
  }),
];
