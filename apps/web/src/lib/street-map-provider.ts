/**
 * The only public street-tile provider this app can load. Keep this closed so
 * deployment configuration cannot turn route coordinates into requests to an
 * arbitrary host.
 */
export const STREET_MAP_PROVIDER = {
  attribution:
    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · <a href="https://www.openstreetmap.org/fixthemap">Report a map issue</a>',
  name: "OpenStreetMap Standard",
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
} as const;
