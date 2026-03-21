import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetDir = path.resolve(__dirname, "../src/theme/shadcn");

const registryFiles = [
  {
    url: "https://ui.shadcn.com/r/styles/new-york-v4/style.json",
    fileName: "style.json",
  },
  {
    url: "https://ui.shadcn.com/r/styles/new-york-v4/theme-neutral.json",
    fileName: "theme-neutral.json",
  },
];

await mkdir(targetDir, { recursive: true });

for (const { url, fileName } of registryFiles) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const body = await response.text();
  await writeFile(path.join(targetDir, fileName), `${body.trim()}\n`);
}
