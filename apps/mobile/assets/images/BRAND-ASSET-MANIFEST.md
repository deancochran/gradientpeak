# GradientPeak brand asset manifest

The production source is `icons/slash-icon-prod.svg`. It contains the approved draft 3
1024-unit artboard, including `transform="translate(-9 9)"`, the frame path, and the
separate `cx="467" cy="557" r="147"` circle. Development and preview SVGs use the same
geometry with their existing blue and orange environment colours; production remains black
for use against the configured white native surfaces.

The mark's approved artboard is rendered directly into every raster size below. No additional
inset or crop is applied: the approved generous transparent bounds are the icon safe area, so
the adaptive and regular icons do not double-pad the glyph.

## Generated files

- `icons/splash-icon-{prod,dev,preview}.png` — 2048×2048 environment splash/icon rasters.
- `adaptive-icon.png`, `icon.png`, `splash-icon.png` — 1024×1024 production rasters.
- `android-chrome-192x192.png`, `android-chrome-512x512.png`, `apple-touch-icon.png`.
- `favicon-16x16.png`, `favicon-32x32.png`, `favicon.png`, `favicon.ico`.
- `../../../web/public/logo192.png`, `../../../web/public/logo512.png`, and
  `../../../web/public/favicon.ico`.
- `../../../web/public/gradientpeak-logo-white.png` — 2048×2048 transparent white
  catalog-cover mark. It is derived from the same production SVG and supplied to the
  Node-only PDF exporter as a data URI; web/mobile runtime code does not import an
  asset across app boundaries.

## Reproduction

From the repository root, with `rsvg-convert` and ImageMagick (`magick`) available:

```sh
prod=apps/mobile/assets/images/icons/slash-icon-prod.svg
rsvg-convert --width 2048 --height 2048 "$prod" > apps/mobile/assets/images/icons/splash-icon-prod.png
for target in \
  'apps/mobile/assets/images/adaptive-icon.png 1024' \
  'apps/mobile/assets/images/icon.png 1024' \
  'apps/mobile/assets/images/splash-icon.png 1024' \
  'apps/mobile/assets/images/android-chrome-192x192.png 192' \
  'apps/mobile/assets/images/android-chrome-512x512.png 512' \
  'apps/mobile/assets/images/apple-touch-icon.png 180' \
  'apps/mobile/assets/images/favicon-16x16.png 16' \
  'apps/mobile/assets/images/favicon-32x32.png 32' \
  'apps/mobile/assets/images/favicon.png 48' \
  'apps/web/public/logo192.png 192' \
  'apps/web/public/logo512.png 512'; do
  set -- $target; rsvg-convert --width "$2" --height "$2" "$prod" > "$1"
done
```

Generate the white catalog-cover PNG from the canonical SVG without changing its
artboard, transform, or transparent bounds:

```sh
rsvg-convert --width 2048 --height 2048 "$prod" |
  magick png:- -fill white -colorize 100 apps/web/public/gradientpeak-logo-white.png
```

Generate the ICO containers from matching PNG sizes after the raster step:

```sh
magick apps/mobile/assets/images/favicon-16x16.png \
  apps/mobile/assets/images/favicon-32x32.png apps/mobile/assets/images/favicon.ico
tmp=$(mktemp -d /tmp/opencode/gradientpeak-favicon.XXXXXX)
rsvg-convert --width 24 --height 24 "$prod" > "$tmp/favicon-24x24.png"
rsvg-convert --width 64 --height 64 "$prod" > "$tmp/favicon-64x64.png"
magick apps/mobile/assets/images/favicon-16x16.png "$tmp/favicon-24x24.png" \
  apps/mobile/assets/images/favicon-32x32.png "$tmp/favicon-64x64.png" \
  apps/web/public/favicon.ico
rm -rf "$tmp"
```

The development and preview splash PNGs are generated identically from their same-named SVG
files, preserving their environment colours.
