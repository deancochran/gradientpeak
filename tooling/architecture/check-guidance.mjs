#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const GENERIC_PNPM_COMMANDS = new Set([
  "add",
  "approve-builds",
  "audit",
  "config",
  "create",
  "dlx",
  "env",
  "exec",
  "fetch",
  "import",
  "init",
  "install",
  "list",
  "outdated",
  "pack",
  "patch",
  "prune",
  "publish",
  "rebuild",
  "remove",
  "run",
  "setup",
  "store",
  "update",
  "why",
]);

function relativePath(root, path) {
  return relative(root, path).split("\\").join("/");
}

function markdownLinks(markdown) {
  /** @type {{ line: number; target: string }[]} */
  const links = [];
  for (const [index, line] of markdown.split("\n").entries()) {
    let cursor = 0;
    while (cursor < line.length) {
      const start = line.indexOf("](", cursor);
      if (start === -1) break;
      const targetStart = start + 2;
      let depth = 1;
      let end = targetStart;
      for (; end < line.length && depth > 0; end += 1) {
        if (line[end] === "(") depth += 1;
        else if (line[end] === ")") depth -= 1;
      }
      if (depth !== 0) break;
      const target = line
        .slice(targetStart, end - 1)
        .trim()
        .split(/\s+/, 1)[0];
      if (target) links.push({ line: index + 1, target });
      cursor = end;
    }
  }
  return links;
}

function isLocalLink(target) {
  return !/^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(target);
}

function hasDeprecatedCaveat(lines, line) {
  return lines.slice(Math.max(0, line - 2), line + 1).some((candidate) => {
    const match = candidate.match(/<!--\s*guidance:\s*allow-deprecated\s+([\s\S]*?)-->/i);
    return Boolean(match?.[1].trim());
  });
}

function collectFiles(root, name, directory = root, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) collectFiles(root, name, path, files);
    else if (entry.name === name) files.push(path);
  }
  return files;
}

function workspaceManifests(root) {
  const manifests = new Map();
  const paths = [resolve(root, "package.json")];
  for (const workspaceRoot of ["apps", "packages", "tooling"]) {
    const directory = resolve(root, workspaceRoot);
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) paths.push(resolve(directory, entry.name, "package.json"));
    }
  }
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifests.set(manifest.name ?? relativePath(root, dirname(path)), {
      path,
      scripts: manifest.scripts ?? {},
    });
  }
  return manifests;
}

function workspacePathFromBacktick(value) {
  const path = value.replace(/\\/g, "/").replace(/\*.*$/, "").replace(/\/$/, "");
  return /^(?:apps|packages|tooling|docs)\//.test(path) ? path : undefined;
}

function pnpmScriptReference(value) {
  const tokens = value
    .trim()
    .replace(/[.,;]$/, "")
    .split(/\s+/);
  if (tokens[0] !== "pnpm") return undefined;
  let filter;
  let index = 1;
  while (tokens[index]?.startsWith("-")) {
    const token = tokens[index];
    if (token === "--filter" || token === "-F") {
      filter = tokens[index + 1];
      index += 2;
    } else if (token.startsWith("--filter=")) {
      filter = token.slice("--filter=".length);
      index += 1;
    } else index += 1;
  }
  if (tokens[index] === "run") index += 1;
  const script = tokens[index];
  if (!script || GENERIC_PNPM_COMMANDS.has(script)) return undefined;
  return { filter, script };
}

function pnpmScriptReferences(value) {
  return value
    .split(/\s*(?:&&|\|\||;)\s*/)
    .map(pnpmScriptReference)
    .filter(Boolean);
}

export function validateGuidance(root, { catalogPath = "docs/agent-exemplars.md" } = {}) {
  /** @type {string[]} */
  const errors = [];
  const catalog = resolve(root, catalogPath);
  if (!existsSync(catalog))
    return [
      `Guidance catalog is missing: ${catalogPath}. Create the checked exemplar catalog before running this gate.`,
    ];

  const catalogLines = readFileSync(catalog, "utf8").split("\n");
  for (const { line, target } of markdownLinks(catalogLines.join("\n"))) {
    if (!isLocalLink(target)) continue;
    const targetPath = resolve(dirname(catalog), decodeURIComponent(target.split("#", 1)[0]));
    if (!targetPath.startsWith(`${resolve(root)}/`) || !existsSync(targetPath)) {
      errors.push(`${catalogPath}:${line}: linked exemplar target is missing: ${target}`);
      continue;
    }
    if (
      /@deprecated\b/i.test(readFileSync(targetPath, "utf8")) &&
      !hasDeprecatedCaveat(catalogLines, line)
    ) {
      errors.push(
        `${catalogPath}:${line}: linked exemplar ${target} contains @deprecated; add <!-- guidance: allow-deprecated reason --> with a documented caveat or choose an active exemplar.`,
      );
    }
  }

  const manifests = workspaceManifests(root);
  for (const agentsPath of collectFiles(root, "AGENTS.md").filter(
    (path) => !relativePath(root, path).includes("/fixtures/"),
  )) {
    const agentsRelativePath = relativePath(root, agentsPath);
    const agentsMarkdown = readFileSync(agentsPath, "utf8");
    for (const { line, target } of markdownLinks(agentsMarkdown)) {
      if (!isLocalLink(target)) continue;
      const targetPath = resolve(dirname(agentsPath), decodeURIComponent(target.split("#", 1)[0]));
      if (!targetPath.startsWith(`${resolve(root)}/`) || !existsSync(targetPath))
        errors.push(`${agentsRelativePath}:${line}: linked guidance target is missing: ${target}`);
    }
    for (const [index, line] of agentsMarkdown.split("\n").entries()) {
      for (const match of line.matchAll(/`([^`]+)`/g)) {
        const workspacePath = workspacePathFromBacktick(match[1]);
        if (workspacePath && !existsSync(resolve(root, workspacePath)))
          errors.push(
            `${agentsRelativePath}:${index + 1}: referenced workspace path is missing: ${workspacePath}`,
          );
        for (const command of pnpmScriptReferences(match[1])) {
          const manifest = command.filter
            ? manifests.get(command.filter)
            : manifests.get("gradientpeak");
          if (!manifest)
            errors.push(
              `${agentsRelativePath}:${index + 1}: pnpm filter does not name a workspace: ${command.filter}`,
            );
          else if (!Object.hasOwn(manifest.scripts, command.script))
            errors.push(
              `${agentsRelativePath}:${index + 1}: pnpm command references missing script ${command.script} in ${relativePath(root, manifest.path)}`,
            );
        }
      }
    }
  }
  return errors;
}

export function main(root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")) {
  const errors = validateGuidance(root);
  if (errors.length === 0) {
    console.log("Guidance validation passed.");
    return 0;
  }
  for (const error of errors) console.error(`Guidance validation failed: ${error}`);
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
