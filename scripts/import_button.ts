import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const rootDir = "./apps/mobile"; // Change to your project folder

function addButtonImportIfUsed(dir: string) {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      addButtonImportIfUsed(fullPath); // Recursive scan
    } else if ([".ts", ".tsx"].includes(extname(entry.name))) {
      const content = readFileSync(fullPath, "utf8");

      // Check if <Button is used and import is missing
      if (
        content.includes("<Button") &&
        !content.includes('import { Button } from "@/components/ui"')
      ) {
        const newContent = `import { Button } from "@/components/ui";\n${content}`;
        writeFileSync(fullPath, newContent, "utf8");
        console.log(`Added Button import to: ${fullPath}`);
      }
    }
  }
}

addButtonImportIfUsed(rootDir);
console.log("Done ✅");
