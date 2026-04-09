import { syncRegistryMirrors } from "./registry-cli-utils.mjs";
import { nativeRegistryComponents, webRegistryComponents } from "./registry-component-catalog.mjs";

await syncRegistryMirrors({
  components: webRegistryComponents,
  platform: "web",
});

await syncRegistryMirrors({
  components: nativeRegistryComponents,
  platform: "native",
  registryPrefix: "@rnr-nativewind/",
});
