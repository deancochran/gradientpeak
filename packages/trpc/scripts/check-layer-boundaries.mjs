import fs from "node:fs";
import path from "node:path";

const packageRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const srcRoot = path.join(packageRoot, "src");

const LAYERS = ["application", "infrastructure", "repositories", "routers"];

const FORBIDDEN_BY_LAYER = {
  application: new Set(["infrastructure", "routers"]),
  infrastructure: new Set(["application", "routers"]),
  repositories: new Set(["application", "infrastructure", "routers"]),
};

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

function getLayer(filePath) {
  const relative = path.relative(srcRoot, filePath).split(path.sep);
  const candidate = relative[0];
  return LAYERS.includes(candidate) ? candidate : null;
}

function parseImportSpecifiers(source) {
  const specifiers = [];
  const importExportRegex =
    /(?:import|export)\s+[\s\S]*?from\s+["']([^"']+)["']/g;
  const sideEffectRegex = /import\s+["']([^"']+)["']/g;

  for (const regex of [importExportRegex, sideEffectRegex]) {
    let match;
    while ((match = regex.exec(source)) !== null) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

function resolveImportTarget(filePath, specifier) {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const base = path.resolve(path.dirname(filePath), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return base;
}

function getTargetLayer(resolvedTarget) {
  const relative = path.relative(srcRoot, resolvedTarget);
  if (relative.startsWith("..")) {
    return null;
  }
  const first = relative.split(path.sep)[0];
  return LAYERS.includes(first) ? first : null;
}

const files = walk(srcRoot);
const violations = [];

for (const filePath of files) {
  const layer = getLayer(filePath);
  if (!layer || !(layer in FORBIDDEN_BY_LAYER)) {
    continue;
  }

  const forbidden = FORBIDDEN_BY_LAYER[layer];
  const source = fs.readFileSync(filePath, "utf8");
  const imports = parseImportSpecifiers(source);

  for (const specifier of imports) {
    const resolved = resolveImportTarget(filePath, specifier);
    if (!resolved) {
      continue;
    }

    const targetLayer = getTargetLayer(resolved);
    if (!targetLayer || !forbidden.has(targetLayer)) {
      continue;
    }

    violations.push({
      filePath: path.relative(packageRoot, filePath),
      specifier,
      sourceLayer: layer,
      targetLayer,
    });
  }
}

if (violations.length > 0) {
  process.stderr.write("Layer boundary violations found:\n");
  for (const violation of violations) {
    process.stderr.write(
      `- ${violation.filePath}: ${violation.sourceLayer} must not import ${violation.targetLayer} (${violation.specifier})\n`,
    );
  }
  process.exit(1);
}

process.stdout.write("Layer boundary check passed.\n");
