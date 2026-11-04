import { fileURLToPath } from "node:url";
import { Font } from "@react-pdf/renderer";

// Node-only catalog export registration. Do not import from browser PDF actions.
Font.register({
  family: "GradientPeakCatalogSans",
  fonts: [
    {
      src: fileURLToPath(new URL("../assets/fonts/DejaVuSans.ttf", import.meta.url)),
      fontWeight: 400,
    },
    {
      src: fileURLToPath(new URL("../assets/fonts/DejaVuSans-Bold.ttf", import.meta.url)),
      fontWeight: 700,
    },
  ],
});
