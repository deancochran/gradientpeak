export type SystemRouteArchiveFormat = "gpx" | "zip";

export interface SystemRouteTemplate {
  description: string;
  download_url: string;
  id: string;
  name: string;
  source_archive_format: SystemRouteArchiveFormat;
}

function createSystemRouteTemplate(input: SystemRouteTemplate): SystemRouteTemplate {
  return input;
}

export const SYSTEM_ROUTE_TEMPLATES: SystemRouteTemplate[] = [
  createSystemRouteTemplate({
    description:
      "Legendary Lake District fell-running challenge covering 42 peaks in a single simplified GPX track.",
    id: "16a9f083-62f5-4ccf-ae41-db48016e2794",
    name: "Bob Graham Round",
    source_archive_format: "gpx",
    download_url:
      "https://thomasturrell.github.io/running-routes/assets/gpx/fell/bob-graham-round/bob-graham-round-simplified.gpx",
  }),
  createSystemRouteTemplate({
    description:
      "Classic Scottish 24-hour mountain round through Lochaber, published as a simplified GPX route.",
    id: "ad1a87f4-61ce-4ba8-9582-1eb1f88b6afd",
    name: "Ramsay Round",
    source_archive_format: "gpx",
    download_url:
      "https://thomasturrell.github.io/running-routes/assets/gpx/fell/ramsay-round/ramsay-round-simplified.gpx",
  }),
  createSystemRouteTemplate({
    description:
      "Snowdonia's iconic Paddy Buckley Round captured as a simplified point-to-point challenge GPX.",
    id: "68fb8e21-b447-4a6d-9063-91fe6bd8dd4a",
    name: "Paddy Buckley Round",
    source_archive_format: "gpx",
    download_url:
      "https://thomasturrell.github.io/running-routes/assets/gpx/fell/paddy-buckley-round/paddy-buckley-round-simplified.gpx",
  }),
  createSystemRouteTemplate({
    description:
      "Road marathon race course through Manchester, published as a simplified GPX for race-day previews.",
    id: "c330e956-0f7c-45a2-9bc8-009326b94cdf",
    name: "Manchester Marathon 2026",
    source_archive_format: "gpx",
    download_url:
      "https://thomasturrell.github.io/running-routes/assets/gpx/road/manchester-marathon-2026/manchester-marathon-2026-simplified.gpx",
  }),
  createSystemRouteTemplate({
    description:
      "Fast Inverness city-centre half marathon route published as a simplified GPX course.",
    id: "f15ecb38-3daa-4784-99c6-2abd0497de71",
    name: "Inverness Half Marathon",
    source_archive_format: "gpx",
    download_url:
      "https://thomasturrell.github.io/running-routes/assets/gpx/road/inverness-half-marathon/inverness-half-marathon-simplified.gpx",
  }),
  createSystemRouteTemplate({
    description:
      "Eifel mountain-bike loop near Raeren with technical off-road terrain, distributed as a downloadable GPX zip.",
    id: "5fcc85f2-1380-49a6-b764-b447da6d68fb",
    name: "Raeren Eifel MTB Ride",
    source_archive_format: "zip",
    download_url:
      "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2023/04/GPXadventures-MTB-raeren.gpx_.zip",
  }),
  createSystemRouteTemplate({
    description:
      "Winter mountain-bike route through Naturpark Eifel, published as a zipped GPX trail file.",
    id: "760950e3-c255-4c2f-8ea1-bb28e14e0774",
    name: "Naturpark Eifel MTB Tour",
    source_archive_format: "zip",
    download_url:
      "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2022/02/Naturpark-Eifel-DE.gpx_.zip",
  }),
  createSystemRouteTemplate({
    description:
      "Scenic Cap Blanc Nez summer mountain-bike route published as a zipped GPX course.",
    id: "f3601986-3fac-45d2-8bf8-f08316a93ccf",
    name: "Cap Blanc Nez MTB Ride",
    source_archive_format: "zip",
    download_url: "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2022/09/Cap-blanc-nez.gpx_.zip",
  }),
  createSystemRouteTemplate({
    description: "Short canyon hike in Belgium with a public zipped GPX file for the full route.",
    id: "91fe6bd8-dd4a-4724-b966-4add24b7fe91",
    name: "Tros Marets Canyon Hike",
    source_archive_format: "zip",
    download_url:
      "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2023/04/GPX-Adventures-Tros-Marets.gpx_.zip",
  }),
  createSystemRouteTemplate({
    description:
      "Classic Zermatt-area hike linking the Matterhorn five lakes, distributed as a zipped GPX file.",
    id: "74079a2d-28bb-4ee1-9c6f-95026fdc49b6",
    name: "Matterhorn 5 Lakes Hike",
    source_archive_format: "zip",
    download_url:
      "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2021/10/Matterhorn-5-lakes-gpx.zip",
  }),
  createSystemRouteTemplate({
    description: "Easy circuit around Lago di Braies, published as a zipped GPX hiking route.",
    id: "c053e679-0c9f-42c5-98eb-d946b3202592",
    name: "Lago di Braies Loop",
    source_archive_format: "zip",
    download_url:
      "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2021/10/Lago-di-braies.gpx_.zip",
  }),
  createSystemRouteTemplate({
    description:
      "More demanding Dolomites out-and-back hike to Lago di Sorapis, distributed as a zipped GPX route.",
    id: "c659a033-12a5-4c7f-9ef1-4bb871de9704",
    name: "Lago di Sorapis Hike",
    source_archive_format: "zip",
    download_url:
      "https://h2n6j5b3.rocketcdn.me/wp-content/uploads/2021/10/Lago-di-sorapis.gpx_.zip",
  }),
];
