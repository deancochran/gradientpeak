#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, posix, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const BINARY_EXTENSIONS = new Set([".png", ".ico", ".ttf", ".jpg", ".jpeg", ".gif", ".webp"]);
const TEST_FILE =
  /(?:^|\/)(?:__tests__|test|tests)(?:\/|$)|\.(?:jest\.)?(?:test|spec)\.[cm]?[jt]sx?$/;
const CONFIG_FILE = /(?:^|\/)(?:[^/]+\.)?(?:config|setup)\.[cm]?[jt]sx?$/;
const GENERATED_FILE = /(?:\.gen\.|\.generated\.)/;
const CONTRACT_SUFFIX = /(Input|Payload|Row|Record)$/;
const DOMAIN_FUNCTION = /^(calculate|derive|score|estimate|normalize|validate)[A-Z_]/i;
const UNSAFE_CATEGORIES = new Set([
  "unsafe-explicit-any",
  "unsafe-as-any",
  "unsafe-ts-ignore",
  "unsafe-ts-expect-error",
  "unsafe-non-null-assertion",
  "unsafe-double-cast",
]);

function normalizePath(path) {
  return path.split(sep).join("/").replace(/^\.\//, "");
}

function sha(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function globRegex(glob) {
  let output = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    const next = glob[index + 1];
    if (character === "*" && next === "*") {
      output += glob[index + 2] === "/" ? "(?:.*/)?" : ".*";
      index += glob[index + 2] === "/" ? 2 : 1;
    } else if (character === "*") output += "[^/]*";
    else if (character === "?") output += "[^/]";
    else output += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`${output}$`);
}

function matches(path, patterns = []) {
  return patterns.some((pattern) => globRegex(pattern).test(path));
}

function parseJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function verificationRules(definition, kind) {
  const value = definition.verification?.[kind];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function commandReferenceIsValid(root, rule, defaultPackageJson, manifestCache) {
  const packageJson = rule.packageJson ?? defaultPackageJson;
  if (!packageJson || !rule.script) return false;
  if (!manifestCache.has(packageJson)) {
    const path = resolve(root, packageJson);
    manifestCache.set(packageJson, existsSync(path) ? parseJson(path) : undefined);
  }
  return Boolean(manifestCache.get(packageJson)?.scripts?.[rule.script]);
}

function tsconfigIncludes(root, tsconfigPath, path, cache) {
  if (!tsconfigPath) return false;
  if (!cache.has(tsconfigPath)) {
    const parsed = ts.getParsedCommandLineOfConfigFile(
      resolve(root, tsconfigPath),
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: () => {},
      },
    );
    cache.set(
      tsconfigPath,
      new Set((parsed?.fileNames ?? []).map((fileName) => normalizePath(relative(root, fileName)))),
    );
  }
  return cache.get(tsconfigPath).has(path);
}

function ownerFor(path, config) {
  const candidates = Object.entries(config.owners).flatMap(([name, owner]) =>
    owner.roots
      .filter(
        (root) => root === "." || path === root || path.startsWith(`${root.replace(/\/$/, "")}/`),
      )
      .map((root) => ({ name, length: root === "." ? 0 : root.length })),
  );
  candidates.sort((a, b) => b.length - a.length || a.name.localeCompare(b.name));
  return candidates[0]?.name;
}

function isExported(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function sourceFileFor(path, text) {
  const kind = path.endsWith("x")
    ? ts.ScriptKind.TSX
    : path.endsWith(".js")
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS;
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function addFinding(findings, category, path, identity, details = {}) {
  findings.push({
    category,
    path,
    fingerprint: sha(`${category}|${path}|${identity}`),
    details,
  });
}

function importsFrom(sourceFile) {
  const imports = [];
  for (const statement of sourceFile.statements) {
    let moduleSpecifier;
    let typeOnly = false;
    if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) {
      moduleSpecifier = statement.moduleSpecifier;
      if (ts.isImportDeclaration(statement)) {
        const clause = statement.importClause;
        typeOnly = Boolean(
          clause?.isTypeOnly ||
            (clause?.namedBindings &&
              ts.isNamedImports(clause.namedBindings) &&
              clause.namedBindings.elements.length > 0 &&
              clause.namedBindings.elements.every((element) => element.isTypeOnly)),
        );
      } else typeOnly = statement.isTypeOnly;
    }
    if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
      imports.push({ specifier: moduleSpecifier.text, typeOnly, node: statement });
    }
  }
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      imports.push({
        specifier: node.arguments[0].text,
        typeOnly: false,
        node,
      });
    }
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      imports.push({ specifier: node.argument.literal.text, typeOnly: true, node });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return imports;
}

function cssImports(text) {
  const imports = [];
  const pattern = /@(?:import|use|forward)\s+(?:url\()?\s*["']([^"']+)["']/g;
  let match = pattern.exec(text);
  while (match) {
    imports.push({ specifier: match[1], typeOnly: false, node: undefined });
    match = pattern.exec(text);
  }
  return imports;
}

function resolveRelativeImport(importer, specifier, trackedSet) {
  const base = normalizePath(posix.normalize(posix.join(posix.dirname(importer), specifier)));
  const candidates = [
    base,
    ...[...CODE_EXTENSIONS, ".css", ".scss", ".json"].map((extension) => `${base}${extension}`),
    ...[...CODE_EXTENSIONS].map((extension) => `${base}/index${extension}`),
  ];
  return candidates.find((candidate) => trackedSet.has(candidate));
}

function resolveAliasImport(importer, specifier, owner, config, trackedSet) {
  const aliases = config.owners[owner]?.aliases ?? {};
  for (const [prefix, target] of Object.entries(aliases)) {
    if (specifier === prefix || specifier.startsWith(`${prefix}/`)) {
      const suffix = specifier.slice(prefix.length).replace(/^\//, "");
      const base = normalizePath(posix.join(target, suffix));
      return resolveRelativeImport(
        importer,
        posix.relative(posix.dirname(importer), base),
        trackedSet,
      );
    }
  }
  return undefined;
}

function packageParts(specifier) {
  if (!specifier.startsWith("@repo/")) return undefined;
  const [scope, name, ...subpath] = specifier.split("/");
  return {
    packageName: `${scope}/${name}`,
    subpath: subpath.length ? `./${subpath.join("/")}` : ".",
  };
}

function exportAllows(exportsField, subpath) {
  if (typeof exportsField === "string") return subpath === ".";
  if (!exportsField || typeof exportsField !== "object") return false;
  return Object.keys(exportsField).some((key) => {
    if (key === subpath) return true;
    if (!key.includes("*")) return false;
    const [before, after] = key.split("*");
    return subpath.startsWith(before) && subpath.endsWith(after ?? "");
  });
}

function findCycles(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node, []]));
  for (const [from, to] of edges) adjacency.get(from)?.push(to);
  for (const values of adjacency.values()) values.sort();
  const cycles = new Set();
  function visit(start, current, path, seen) {
    for (const next of adjacency.get(current) ?? []) {
      if (next === start && path.length > 1) {
        const cycle = [...path, start];
        const body = cycle.slice(0, -1);
        const rotations = body.map((_, index) => [...body.slice(index), ...body.slice(0, index)]);
        rotations.sort((a, b) => a.join(">").localeCompare(b.join(">")));
        cycles.add(`${rotations[0].join(">")}>${rotations[0][0]}`);
      } else if (!seen.has(next) && path.length < nodes.length) {
        visit(start, next, [...path, next], new Set([...seen, next]));
      }
    }
  }
  for (const node of nodes) visit(node, node, [node], new Set([node]));
  return [...cycles].sort();
}

function declarationName(node) {
  return node.name && ts.isIdentifier(node.name) ? node.name.text : undefined;
}

function contractKind(node, name, initializer) {
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (
    ((ts.isFunctionDeclaration(node) && declarationName(node)) ||
      (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)))) &&
    name &&
    DOMAIN_FUNCTION.test(name)
  ) {
    return "domain-function";
  }
  if (initializer && name) {
    if (initializer && (/Schema$/.test(name) || initializer.getText().includes("z.")))
      return "zod-schema";
    if (
      initializer &&
      (ts.isArrayLiteralExpression(initializer) ||
        (/^[A-Z][A-Z0-9_]+$/.test(name) && initializer.getText().includes("as const")))
    ) {
      return "literal-value";
    }
  }
  return undefined;
}

function normalizedMembers(members, sourceFile) {
  return members
    .map((member) => member.getText(sourceFile).replace(/\s+/g, " "))
    .sort()
    .join(";");
}

function structuralText(node, sourceFile, name, initializer) {
  if (ts.isInterfaceDeclaration(node))
    return sha(`object:${normalizedMembers(node.members, sourceFile)}`);
  if (ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)) {
    return sha(`object:${normalizedMembers(node.type.members, sourceFile)}`);
  }
  const literals = extractLiteralValues(initializer);
  if (literals.length) return sha(`literals:${[...new Set(literals)].sort().join("|")}`);
  const text = (initializer ?? node)
    .getText(sourceFile)
    .replace(/\s+/g, " ")
    .replaceAll(name, "$NAME");
  return sha(text.replace(/^export\s+/, ""));
}

function exportedLocalNames(sourceFile) {
  const names = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier) continue;
    if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements)
        names.add(element.propertyName?.text ?? element.name.text);
    }
  }
  return names;
}

function importedTypeBindings(sourceFile) {
  const names = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const clause = statement.importClause;
    if (clause.name) names.add(clause.name.text);
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) names.add(element.name.text);
    }
  }
  return names;
}

function isDerivedOrReplica(node, importedBindings) {
  if (!ts.isTypeAliasDeclaration(node)) return false;
  const text = node.type.getText();
  if (/\bRouter(?:Inputs|Outputs)\b/.test(text)) return true;
  return ts.isTypeReferenceNode(node.type) && importedBindings.has(node.type.typeName.getText());
}

function extractLiteralValues(initializer) {
  if (!initializer) return [];
  if (ts.isStringLiteralLike(initializer)) return [initializer.text];
  if (ts.isArrayLiteralExpression(initializer)) {
    return initializer.elements.flatMap((element) => extractLiteralValues(element));
  }
  if (ts.isObjectLiteralExpression(initializer)) {
    return initializer.properties
      .filter(ts.isPropertyAssignment)
      .map((property) => property.name)
      .filter((name) => ts.isIdentifier(name) || ts.isStringLiteralLike(name))
      .map((name) => name.text);
  }
  if (ts.isCallExpression(initializer)) {
    const callee = initializer.expression.getText();
    const argument = /(?:pgEnum|\.enum)$/.test(callee)
      ? initializer.arguments[initializer.arguments.length - 1]
      : initializer.arguments[0];
    return extractLiteralValues(argument);
  }
  if (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer)) {
    return extractLiteralValues(initializer.expression);
  }
  return [];
}

function symbolValues(root, mapping) {
  const path = resolve(root, mapping.file);
  const sourceFile = sourceFileFor(mapping.file, readFileSync(path, "utf8"));
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === mapping.symbol) {
        return extractLiteralValues(declaration.initializer);
      }
    }
  }
  return [];
}

function isTrpcCall(node) {
  if (!ts.isCallExpression(node)) return false;
  const expression = node.expression.getText();
  return /(?:^|\.)trpc(?:\.|$)|\.(?:queryOptions|mutationOptions|useQuery|useMutation|mutate|mutateAsync)$/.test(
    expression,
  );
}

function containsIdentifier(node, name) {
  let found = false;
  function visit(child) {
    if (ts.isIdentifier(child) && child.text === name) found = true;
    if (!found) ts.forEachChild(child, visit);
  }
  visit(node);
  return found;
}

function scanUnsafe(path, sourceFile, findings, owner) {
  if (!/^(apps|packages)\//.test(path) || TEST_FILE.test(path) || GENERATED_FILE.test(path)) return;
  const counts = new Map();
  function contextFor(node) {
    let current = node;
    while (current?.parent && current.parent !== sourceFile) {
      if (
        (ts.isFunctionLike(current) ||
          ts.isVariableDeclaration(current) ||
          ts.isClassDeclaration(current) ||
          ts.isInterfaceDeclaration(current)) &&
        current.name
      ) {
        return current.name.getText(sourceFile);
      }
      current = current.parent;
    }
    return "<module>";
  }
  function record(category, node) {
    const syntax = node.getText
      ? node.getText(sourceFile).replace(/\s+/g, " ").slice(0, 240)
      : category;
    const context = contextFor(node);
    const key = `${category}|${context}|${sha(syntax)}`;
    const ordinal = (counts.get(key) ?? 0) + 1;
    counts.set(key, ordinal);
    addFinding(findings, category, path, `${context}|${sha(syntax)}|${ordinal}`, {
      owner,
      line: lineOf(sourceFile, node),
    });
  }
  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      if (ts.isAsExpression(node.parent) && node.parent.type === node)
        record("unsafe-as-any", node.parent);
      else record("unsafe-explicit-any", node);
    }
    if (
      ts.isAsExpression(node) &&
      ts.isAsExpression(node.expression) &&
      (node.expression.type.kind === ts.SyntaxKind.UnknownKeyword ||
        node.expression.type.kind === ts.SyntaxKind.AnyKeyword)
    ) {
      record("unsafe-double-cast", node);
    }
    if (ts.isNonNullExpression(node)) record("unsafe-non-null-assertion", node);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  const ignoreRegex = /@ts-ignore/g;
  let match = ignoreRegex.exec(sourceFile.text);
  while (match) {
    const fakeNode = {
      getStart: () => match.index,
      getText: () => "@ts-ignore",
      parent: sourceFile,
    };
    record("unsafe-ts-ignore", fakeNode);
    match = ignoreRegex.exec(sourceFile.text);
  }
  const expectRegex = /@ts-expect-error/g;
  match = expectRegex.exec(sourceFile.text);
  while (match) {
    const fakeNode = {
      getStart: () => match.index,
      getText: () => "@ts-expect-error",
      parent: sourceFile,
    };
    record("unsafe-ts-expect-error", fakeNode);
    match = expectRegex.exec(sourceFile.text);
  }
}

export function validateReviewedEntries(config, today = new Date().toISOString().slice(0, 10)) {
  const errors = [];
  for (const entry of [...(config.exceptions ?? []), ...(config.reviewedIgnores ?? [])]) {
    if (!entry.owner) errors.push(`${entry.id ?? entry.path}: missing owner`);
    if (!entry.reason) errors.push(`${entry.id ?? entry.path}: missing reason`);
    if (!entry.expiresOn) errors.push(`${entry.id ?? entry.path}: missing expiry`);
    else if (entry.expiresOn < today)
      errors.push(`${entry.id ?? entry.path}: expired ${entry.expiresOn}`);
    if (config.exceptions?.includes(entry)) {
      if (!entry.fingerprint && !Number.isInteger(entry.maxCount)) {
        errors.push(`${entry.id ?? entry.path}: exception requires fingerprint or maxCount`);
      }
      if (entry.maxCount && /[*?]/.test(entry.path)) {
        errors.push(`${entry.id ?? entry.path}: count exception path must be exact`);
      }
    }
  }
  for (const mapping of config.enumParity ?? []) {
    if (!(mapping.allowedDbOnly?.length || mapping.allowedCoreOnly?.length)) continue;
    if (!mapping.owner) errors.push(`${mapping.id}: allowed enum difference missing owner`);
    if (!mapping.reason) errors.push(`${mapping.id}: allowed enum difference missing reason`);
    if (!mapping.expiresOn) errors.push(`${mapping.id}: allowed enum difference missing expiry`);
    else if (mapping.expiresOn < today)
      errors.push(`${mapping.id}: allowed enum difference expired`);
  }
  return errors;
}

function applyExceptions(findings, exceptions) {
  const reviewed = [];
  const counts = new Map();
  const active = findings.filter((finding) => {
    for (const candidate of exceptions) {
      if (candidate.category !== finding.category || !globRegex(candidate.path).test(finding.path))
        continue;
      if (candidate.fingerprint && candidate.fingerprint !== finding.fingerprint) continue;
      const used = counts.get(candidate.id) ?? 0;
      if (candidate.maxCount !== undefined && used >= candidate.maxCount) continue;
      counts.set(candidate.id, used + 1);
      reviewed.push({ ...finding, reason: candidate.reason });
      return false;
    }
    return true;
  });
  return { active, reviewed };
}

export function analyzeProject(root, config, trackedFiles) {
  const tracked = trackedFiles.map(normalizePath).sort();
  const trackedSet = new Set(tracked);
  const findings = [];
  const parsedFiles = new Map();
  const contracts = [];
  const runtimeEdges = new Set();
  const typeEdges = new Set();
  const packagesByName = new Map();
  const manifestCache = new Map();
  const tsconfigCache = new Map();

  const workspaceManifests = tracked.filter((path) =>
    /^(apps|packages|tooling)\/[^/]+\/package\.json$/.test(path),
  );
  for (const [ownerName, owner] of Object.entries(config.owners)) {
    if (!owner.packageJson) continue;
    const manifest = parseJson(resolve(root, owner.packageJson));
    packagesByName.set(manifest.name, { ownerName, manifest });
  }
  for (const manifestPath of workspaceManifests) {
    const registered = Object.values(config.owners).some(
      (owner) => owner.packageJson === manifestPath,
    );
    if (!registered) {
      addFinding(findings, "workspace-manifest-ownership", manifestPath, manifestPath, {
        missing: "workspace owner",
      });
    }
  }

  for (const path of tracked) {
    const isCode = CODE_EXTENSIONS.has(extname(path));
    const isCss = path.endsWith(".css") || path.endsWith(".scss");
    if ((!isCode && !isCss) || matches(path, config.scanExcludes)) continue;
    const absolute = resolve(root, path);
    if (!existsSync(absolute)) continue;
    const text = readFileSync(absolute, "utf8");
    const sourceFile = isCode ? sourceFileFor(path, text) : undefined;
    if (sourceFile) parsedFiles.set(path, sourceFile);
    const owner = ownerFor(path, config);
    if (!owner) continue;

    if (sourceFile) scanUnsafe(path, sourceFile, findings, owner);
    const importedModules = sourceFile ? importsFrom(sourceFile) : cssImports(text);
    for (const imported of importedModules) {
      let targetOwner;
      if (imported.specifier.startsWith(".")) {
        const target = resolveRelativeImport(path, imported.specifier, trackedSet);
        targetOwner = target ? ownerFor(target, config) : undefined;
        if (targetOwner && targetOwner !== owner) {
          addFinding(
            findings,
            "cross-workspace-relative-import",
            path,
            `${imported.specifier}|${imported.node ? lineOf(sourceFile, imported.node) : 0}`,
            {
              from: owner,
              to: targetOwner,
              specifier: imported.specifier,
            },
          );
        }
      } else {
        const aliasTarget = resolveAliasImport(path, imported.specifier, owner, config, trackedSet);
        if (aliasTarget) targetOwner = ownerFor(aliasTarget, config);
        const parts = packageParts(imported.specifier);
        const targetPackage = parts ? packagesByName.get(parts.packageName) : undefined;
        targetOwner = targetPackage?.ownerName ?? targetOwner;
        if (
          parts &&
          targetPackage &&
          !exportAllows(targetPackage.manifest.exports, parts.subpath)
        ) {
          addFinding(findings, "undeclared-package-export", path, imported.specifier, {
            package: parts.packageName,
            subpath: parts.subpath,
          });
        }
        if (parts && /(?:^|\/)src(?:\/|$)/.test(parts.subpath)) {
          addFinding(findings, "workspace-source-import", path, imported.specifier, {
            specifier: imported.specifier,
          });
        }
      }
      if (targetOwner && targetOwner !== owner) {
        const edge = `${owner}|${targetOwner}`;
        (imported.typeOnly ? typeEdges : runtimeEdges).add(edge);
        if (!(config.allowedDependencies[owner] ?? []).includes(targetOwner)) {
          addFinding(
            findings,
            "dependency-direction",
            path,
            `${owner}|${targetOwner}|${imported.specifier}`,
            {
              from: owner,
              to: targetOwner,
              typeOnly: imported.typeOnly,
            },
          );
        }
      }
    }

    if (!sourceFile) continue;
    const exportList = exportedLocalNames(sourceFile);
    const importedBindings = importedTypeBindings(sourceFile);
    for (const statement of sourceFile.statements) {
      const exported =
        isExported(statement) ||
        (declarationName(statement) && exportList.has(declarationName(statement)));
      const candidates = ts.isVariableStatement(statement)
        ? statement.declarationList.declarations
            .filter((declaration) => ts.isIdentifier(declaration.name))
            .map((declaration) => ({
              node: statement,
              name: declaration.name.text,
              initializer: declaration.initializer,
              exported: isExported(statement) || exportList.has(declaration.name.text),
            }))
        : [{ node: statement, name: declarationName(statement), initializer: undefined, exported }];
      for (const candidate of candidates) {
        const kind = candidate.exported
          ? contractKind(candidate.node, candidate.name, candidate.initializer)
          : undefined;
        if (kind && candidate.name && !isDerivedOrReplica(candidate.node, importedBindings)) {
          contracts.push({
            owner,
            path,
            name: candidate.name,
            kind,
            structure: structuralText(
              candidate.node,
              sourceFile,
              candidate.name,
              candidate.initializer,
            ),
          });
        }
      }
      if (
        (owner === "web" || owner === "mobile") &&
        (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) &&
        declarationName(statement) &&
        CONTRACT_SUFFIX.test(declarationName(statement))
      ) {
        const name = declarationName(statement);
        if (isDerivedOrReplica(statement, importedBindings)) continue;
        let used = false;
        function visit(node) {
          if (isTrpcCall(node) && containsIdentifier(node, name)) used = true;
          ts.forEachChild(node, visit);
        }
        visit(sourceFile);
        if (used) addFinding(findings, "app-local-trpc-contract", path, name, { name, owner });
      }
    }
  }

  for (const [kind, edges] of [
    ["runtime", runtimeEdges],
    ["type", typeEdges],
    ["combined", new Set([...runtimeEdges, ...typeEdges])],
  ]) {
    for (const cycle of findCycles(
      Object.keys(config.owners),
      [...edges].map((edge) => edge.split("|")),
    )) {
      addFinding(findings, `${kind}-dependency-cycle`, "<workspace>", cycle, { cycle });
    }
  }

  const byName = new Map();
  const byStructure = new Map();
  for (const contract of contracts) {
    if (!byName.has(contract.name)) byName.set(contract.name, []);
    byName.get(contract.name).push(contract);
    if (!byStructure.has(contract.structure)) byStructure.set(contract.structure, []);
    byStructure.get(contract.structure).push(contract);
  }
  for (const [name, declarations] of byName) {
    const owners = [...new Set(declarations.map((declaration) => declaration.owner))].sort();
    if (owners.length > 1) {
      addFinding(
        findings,
        "contract-name-collision",
        "<workspace>",
        `${name}|${owners.join("|")}`,
        {
          name,
          owners,
          paths: declarations.map((declaration) => declaration.path).sort(),
        },
      );
    }
  }
  for (const [structure, declarations] of byStructure) {
    const owners = [...new Set(declarations.map((declaration) => declaration.owner))].sort();
    const names = [...new Set(declarations.map((declaration) => declaration.name))].sort();
    if (owners.length > 1 && names.length > 1) {
      addFinding(
        findings,
        "contract-structural-collision",
        "<workspace>",
        `${structure}|${owners.join("|")}`,
        {
          owners,
          names,
          paths: declarations.map((declaration) => declaration.path).sort(),
        },
      );
    }
  }

  for (const mapping of config.enumParity ?? []) {
    const dbValues = symbolValues(root, mapping.db);
    const coreValues = symbolValues(root, mapping.core);
    const allowedDbOnly = new Set(mapping.allowedDbOnly ?? []);
    const allowedCoreOnly = new Set(mapping.allowedCoreOnly ?? []);
    const dbOnly = dbValues.filter(
      (value) => !coreValues.includes(value) && !allowedDbOnly.has(value),
    );
    const coreOnly = coreValues.filter(
      (value) => !dbValues.includes(value) && !allowedCoreOnly.has(value),
    );
    if (dbValues.length === 0 || coreValues.length === 0 || dbOnly.length || coreOnly.length) {
      addFinding(findings, "db-core-enum-parity", "<workspace>", mapping.id, {
        id: mapping.id,
        dbOnly,
        coreOnly,
        missingSymbol: dbValues.length === 0 || coreValues.length === 0,
      });
    }
  }

  for (const path of tracked) {
    if (BINARY_EXTENSIONS.has(extname(path))) continue;
    const reviewedIgnore = (config.reviewedIgnores ?? []).find((entry) =>
      globRegex(entry.path).test(path),
    );
    if (reviewedIgnore) continue;
    const owner = ownerFor(path, config);
    if (!owner) {
      addFinding(findings, "verification-coverage", path, "owner", { missing: "owner" });
      continue;
    }
    const coverage = config.coverage;
    const ownerDefinition = config.owners[owner];
    const commandRules = [
      ...verificationRules(ownerDefinition, "lint"),
      ...verificationRules(ownerDefinition, "static"),
    ].filter((rule) => matches(path, rule.patterns));
    if (
      commandRules.length === 0 ||
      !commandRules.some((rule) =>
        commandReferenceIsValid(root, rule, ownerDefinition.packageJson, manifestCache),
      )
    ) {
      addFinding(findings, "verification-coverage", path, "executable-command", {
        owner,
        missing: "executable lint/static command",
      });
    }
    const categories = Object.entries(coverage.categories ?? {})
      .filter(([, patterns]) => matches(path, patterns))
      .map(([category]) => category);
    if (categories.length === 0) {
      addFinding(findings, "verification-coverage", path, "category", { missing: "category" });
    }
    for (const category of categories) {
      if (!coverage.categoryCommands?.[category]) {
        addFinding(findings, "verification-coverage", path, `category-command:${category}`, {
          missing: `verification command for ${category}`,
        });
      }
    }
    if (
      CODE_EXTENSIONS.has(extname(path)) &&
      !matches(path, coverage.lintExcludes) &&
      !matches(path, coverage.lint)
    ) {
      addFinding(findings, "verification-coverage", path, "lint", { missing: "lint" });
    }
    const requiresTypecheck =
      (path.endsWith(".ts") || path.endsWith(".tsx")) &&
      !TEST_FILE.test(path) &&
      !CONFIG_FILE.test(path);
    if (requiresTypecheck && !matches(path, coverage.typecheck)) {
      addFinding(findings, "verification-coverage", path, "typecheck", { missing: "typecheck" });
    }
    if (requiresTypecheck) {
      const typeRules = verificationRules(ownerDefinition, "typecheck").filter((rule) =>
        matches(path, rule.patterns),
      );
      if (
        !typeRules.some(
          (rule) =>
            commandReferenceIsValid(root, rule, ownerDefinition.packageJson, manifestCache) &&
            tsconfigIncludes(root, rule.tsconfig, path, tsconfigCache),
        )
      ) {
        addFinding(findings, "verification-coverage", path, "concrete-typecheck", {
          owner,
          missing: "package script/tsconfig inclusion",
        });
      }
    }
    if (/^packages\/db\/supabase\/functions\/.*\.[jt]sx?$/.test(path)) {
      const supabaseRules = verificationRules(ownerDefinition, "typecheck").filter((rule) =>
        matches(path, rule.patterns),
      );
      if (
        !matches(path, coverage.typecheck) ||
        !supabaseRules.some(
          (rule) =>
            commandReferenceIsValid(root, rule, ownerDefinition.packageJson, manifestCache) &&
            tsconfigIncludes(root, rule.tsconfig, path, tsconfigCache),
        )
      ) {
        addFinding(findings, "verification-coverage", path, "supabase-typecheck", {
          missing: "executable Supabase typecheck script/tsconfig inclusion",
        });
      }
    }
    if (TEST_FILE.test(path) && !matches(path, coverage.test)) {
      addFinding(findings, "verification-coverage", path, "test", { missing: "test" });
    }
    if (TEST_FILE.test(path)) {
      const testRules = verificationRules(ownerDefinition, "test").filter((rule) =>
        matches(path, rule.patterns),
      );
      if (
        !testRules.some((rule) =>
          commandReferenceIsValid(root, rule, ownerDefinition.packageJson, manifestCache),
        )
      ) {
        addFinding(findings, "verification-coverage", path, "concrete-test", {
          owner,
          missing: "package test script/runner pattern",
        });
      }
    }
    if (
      GENERATED_FILE.test(path) &&
      !config.generatedOwners.some((entry) => globRegex(entry.path).test(path))
    ) {
      addFinding(findings, "verification-coverage", path, "generated-freshness", {
        missing: "generated-freshness",
      });
    }
    const generatedOwner = config.generatedOwners.find((entry) => globRegex(entry.path).test(path));
    if (
      generatedOwner &&
      !commandReferenceIsValid(root, generatedOwner, ownerDefinition.packageJson, manifestCache)
    ) {
      addFinding(findings, "verification-coverage", path, "generated-command", {
        owner,
        missing: "generated validation package script",
      });
    }
  }

  findings.sort((a, b) =>
    `${a.category}|${a.path}|${a.fingerprint}`.localeCompare(
      `${b.category}|${b.path}|${b.fingerprint}`,
    ),
  );
  return applyExceptions(findings, config.exceptions ?? []);
}

export function baselineFrom(findings) {
  const categories = {};
  const unsafe = {};
  for (const finding of findings) {
    categories[finding.category] ??= { count: 0, fingerprints: [] };
    categories[finding.category].count += 1;
    categories[finding.category].fingerprints.push(finding.fingerprint);
    if (UNSAFE_CATEGORIES.has(finding.category)) {
      const owner = finding.details.owner ?? "unknown";
      unsafe[finding.category] ??= { owners: {}, files: {} };
      unsafe[finding.category].owners[owner] ??= { count: 0, fingerprints: [] };
      unsafe[finding.category].files[finding.path] ??= { count: 0, fingerprints: [] };
      for (const bucket of [
        unsafe[finding.category].owners[owner],
        unsafe[finding.category].files[finding.path],
      ]) {
        bucket.count += 1;
        bucket.fingerprints.push(finding.fingerprint);
      }
    }
  }
  for (const category of Object.values(categories)) category.fingerprints.sort();
  for (const groups of Object.values(unsafe)) {
    groups.owners = Object.fromEntries(Object.entries(groups.owners).sort());
    groups.files = Object.fromEntries(Object.entries(groups.files).sort());
    for (const bucket of [...Object.values(groups.owners), ...Object.values(groups.files)]) {
      bucket.fingerprints.sort();
    }
  }
  return {
    version: 2,
    categories: Object.fromEntries(Object.entries(categories).sort()),
    unsafe: Object.fromEntries(Object.entries(unsafe).sort()),
  };
}

export function compareBaseline(findings, baseline) {
  const currentBaseline = baselineFrom(findings);
  const newFindings = [];
  for (const finding of findings) {
    const accepted = baseline.categories[finding.category];
    if (UNSAFE_CATEGORIES.has(finding.category)) continue;
    if (!accepted?.fingerprints.includes(finding.fingerprint)) newFindings.push(finding);
  }
  for (const category of UNSAFE_CATEGORIES) {
    for (const dimension of ["owners", "files"]) {
      for (const [key, current] of Object.entries(
        currentBaseline.unsafe[category]?.[dimension] ?? {},
      )) {
        const accepted = baseline.unsafe?.[category]?.[dimension]?.[key];
        const newFingerprints = current.fingerprints.filter(
          (fingerprint) => !accepted?.fingerprints.includes(fingerprint),
        );
        if (current.count > (accepted?.count ?? 0) || newFingerprints.length) {
          newFindings.push({
            category,
            path: dimension === "files" ? key : `<owner:${key}>`,
            fingerprint: `unsafe-${dimension}-growth`,
            details: {
              dimension,
              current: current.count,
              accepted: accepted?.count ?? 0,
              newFingerprints,
            },
          });
        }
      }
    }
  }
  return newFindings;
}

function policyFinding(category, details) {
  return { category, path: "<policy>", fingerprint: sha(JSON.stringify(details)), details };
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value
      .map(canonicalize)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function canonicalPolicy(config) {
  return canonicalize({
    allowedDependencies: config.allowedDependencies ?? {},
    coverage: config.coverage ?? {},
    enumParity: config.enumParity ?? [],
    exceptions: config.exceptions ?? [],
    generatedOwners: config.generatedOwners ?? [],
    owners: config.owners ?? {},
    reviewedIgnores: config.reviewedIgnores ?? [],
    scanExcludes: config.scanExcludes ?? [],
  });
}

export function compareMergeBaseProtection(current, previous, approved = false) {
  if (!previous?.baseline && !previous?.config) return { bootstrap: true, findings: [] };
  if (approved) return { bootstrap: false, findings: [] };
  const bootstrap = !previous?.baseline || !previous?.config;
  const findings = [];
  const oldBaseline = previous.baseline ?? current.baseline;
  for (const [category, value] of Object.entries(current.baseline.categories ?? {})) {
    const old = oldBaseline.categories?.[category];
    const added = value.fingerprints.filter(
      (fingerprint) => !old?.fingerprints.includes(fingerprint),
    );
    if (value.count > (old?.count ?? 0) || added.length) {
      findings.push(
        policyFinding("merge-base-debt-increase", {
          category,
          added,
          count: value.count,
          previous: old?.count ?? 0,
        }),
      );
    }
  }
  for (const [category, dimensions] of Object.entries(current.baseline.unsafe ?? {})) {
    for (const dimension of ["owners", "files"]) {
      for (const [key, value] of Object.entries(dimensions[dimension] ?? {})) {
        const old = oldBaseline.unsafe?.[category]?.[dimension]?.[key];
        if (value.count > (old?.count ?? 0)) {
          findings.push(
            policyFinding("merge-base-unsafe-increase", {
              category,
              dimension,
              key,
              count: value.count,
              previous: old?.count ?? 0,
            }),
          );
        }
      }
    }
  }
  const currentPolicy = canonicalPolicy(current.config);
  const oldConfig = canonicalPolicy(previous.config ?? current.config);
  for (const [owner, dependencies] of Object.entries(currentPolicy.allowedDependencies)) {
    const oldDependencies = oldConfig.allowedDependencies[owner] ?? [];
    const added = dependencies.filter((dependency) => !oldDependencies.includes(dependency));
    if (added.length) {
      findings.push(
        policyFinding("merge-base-policy-widening", {
          field: `allowedDependencies.${owner}`,
          added,
        }),
      );
    }
  }
  const addedScanExcludes = currentPolicy.scanExcludes.filter(
    (pattern) => !oldConfig.scanExcludes.includes(pattern),
  );
  if (addedScanExcludes.length) {
    findings.push(
      policyFinding("merge-base-policy-widening", {
        field: "scanExcludes",
        added: addedScanExcludes,
      }),
    );
  }
  for (const [owner, definition] of Object.entries(oldConfig.owners)) {
    const next = currentPolicy.owners[owner];
    if (!next) {
      findings.push(policyFinding("merge-base-coverage-weakening", { removedOwner: owner }));
      continue;
    }
    for (const field of ["roots", "packageJson", "aliases", "verification"]) {
      if (JSON.stringify(definition[field] ?? null) !== JSON.stringify(next[field] ?? null)) {
        findings.push(
          policyFinding("merge-base-policy-widening", { owner, changedOwnershipField: field }),
        );
      }
    }
  }
  for (const collection of ["exceptions", "reviewedIgnores"]) {
    const oldById = new Map((oldConfig[collection] ?? []).map((entry) => [entry.id, entry]));
    for (const entry of current.config[collection] ?? []) {
      const old = oldById.get(entry.id);
      const widened =
        !old ||
        old.path !== entry.path ||
        old.owner !== entry.owner ||
        old.reason !== entry.reason ||
        (collection === "exceptions" &&
          (old.category !== entry.category ||
            (old.fingerprint && old.fingerprint !== entry.fingerprint) ||
            (old.maxCount !== undefined &&
              entry.maxCount !== undefined &&
              entry.maxCount > old.maxCount) ||
            (old.maxCount !== undefined && entry.maxCount === undefined && !entry.fingerprint))) ||
        (old.expiresOn && entry.expiresOn > old.expiresOn);
      if (widened) {
        findings.push(policyFinding("merge-base-exception-widening", { collection, id: entry.id }));
      }
    }
  }
  const oldMappings = new Map(oldConfig.enumParity.map((entry) => [entry.id, entry]));
  const currentMappings = new Map(currentPolicy.enumParity.map((entry) => [entry.id, entry]));
  for (const [id, old] of oldMappings) {
    const mapping = currentMappings.get(id);
    if (!mapping) {
      findings.push(policyFinding("merge-base-coverage-weakening", { removedEnumMapping: id }));
      continue;
    }
    for (const field of ["db", "core"]) {
      if (JSON.stringify(old[field]) !== JSON.stringify(mapping[field])) {
        findings.push(
          policyFinding("merge-base-coverage-weakening", { id, changedEnumSource: field }),
        );
      }
    }
    for (const field of ["owner", "reason"]) {
      if ((old[field] ?? null) !== (mapping[field] ?? null)) {
        findings.push(policyFinding("merge-base-policy-widening", { id, changedEnumField: field }));
      }
    }
  }
  for (const mapping of currentPolicy.enumParity) {
    const old = oldMappings.get(mapping.id);
    for (const key of ["allowedDbOnly", "allowedCoreOnly"]) {
      const added = (mapping[key] ?? []).filter((value) => !(old?.[key] ?? []).includes(value));
      if (added.length) {
        findings.push(
          policyFinding("merge-base-exception-widening", {
            collection: "enumParity",
            id: mapping.id,
            key,
            added,
          }),
        );
      }
    }
  }
  for (const key of ["lint", "typecheck", "test"]) {
    for (const pattern of oldConfig.coverage?.[key] ?? []) {
      if (!(current.config.coverage?.[key] ?? []).includes(pattern)) {
        findings.push(policyFinding("merge-base-coverage-weakening", { key, removed: pattern }));
      }
    }
  }
  for (const [category, patterns] of Object.entries(oldConfig.coverage?.categories ?? {})) {
    for (const pattern of patterns) {
      if (!(current.config.coverage?.categories?.[category] ?? []).includes(pattern)) {
        findings.push(
          policyFinding("merge-base-coverage-weakening", { category, removed: pattern }),
        );
      }
    }
  }
  for (const [category, command] of Object.entries(oldConfig.coverage?.categoryCommands ?? {})) {
    if (current.config.coverage?.categoryCommands?.[category] !== command) {
      findings.push(
        policyFinding("merge-base-coverage-weakening", { category, changedCommand: command }),
      );
    }
  }
  for (const pattern of current.config.coverage?.lintExcludes ?? []) {
    if (!(oldConfig.coverage?.lintExcludes ?? []).includes(pattern)) {
      findings.push(policyFinding("merge-base-coverage-weakening", { addedLintExclude: pattern }));
    }
  }
  for (const generated of oldConfig.generatedOwners ?? []) {
    const currentGenerated = currentPolicy.generatedOwners.find(
      (entry) => entry.path === generated.path,
    );
    if (!currentGenerated || JSON.stringify(currentGenerated) !== JSON.stringify(generated)) {
      findings.push(policyFinding("merge-base-coverage-weakening", { generated: generated.path }));
    }
  }
  return { bootstrap, findings };
}

function trackedFiles(root) {
  const listed = (args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  return [
    ...new Set([
      ...listed(["ls-files", "-z"]),
      ...listed(["ls-files", "--others", "--exclude-standard", "-z"]),
    ]),
  ];
}

function readMergeBasePolicy(root) {
  const target =
    process.env.ARCHITECTURE_MERGE_BASE_REF ??
    (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "origin/dev");
  try {
    const mergeBase = execFileSync("git", ["merge-base", "HEAD", target], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    const readAt = (path) => {
      try {
        return JSON.parse(
          execFileSync("git", ["show", `${mergeBase}:${path}`], {
            cwd: root,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
          }),
        );
      } catch {
        return undefined;
      }
    };
    return {
      mergeBase,
      baseline: readAt("tooling/architecture/architecture-baseline.json"),
      config: readAt("tooling/architecture/architecture.config.json"),
    };
  } catch {
    return undefined;
  }
}

function verifyGeneratedFreshness(root, config) {
  const findings = [];
  const commands = new Map();
  for (const entry of config.generatedOwners ?? []) {
    if (!commands.has(entry.freshnessCommand)) commands.set(entry.freshnessCommand, []);
    commands.get(entry.freshnessCommand).push(entry.path);
  }
  for (const [command, paths] of commands) {
    const snapshots = new Map(
      paths.map((path) => [
        path,
        existsSync(resolve(root, path)) ? readFileSync(resolve(root, path)) : undefined,
      ]),
    );
    try {
      execFileSync("sh", ["-c", command], { cwd: root, stdio: "pipe", env: process.env });
    } catch (error) {
      findings.push(
        policyFinding("generated-freshness-command-failed", {
          command,
          status: error.status ?? 1,
        }),
      );
    }
    for (const path of paths) {
      const before = snapshots.get(path);
      const absolute = resolve(root, path);
      const after = existsSync(absolute) ? readFileSync(absolute) : undefined;
      if (!before || !after || !before.equals(after)) {
        if (before) writeFileSync(absolute, before);
        else if (after) unlinkSync(absolute);
        findings.push(policyFinding("generated-artifact-stale", { path, command }));
      }
    }
  }
  return findings;
}

function report(findings, reviewed, newFindings) {
  const counts = baselineFrom(findings).categories;
  console.log("Architecture report (baseline-aware)");
  for (const [category, value] of Object.entries(counts))
    console.log(`  ${category}: ${value.count}`);
  console.log(`  reviewed exceptions: ${reviewed.length}`);
  console.log(`  new violations: ${newFindings.length}`);
  for (const finding of newFindings) {
    console.error(`NEW ${finding.category} ${finding.path} ${JSON.stringify(finding.details)}`);
  }
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const configPath = resolve(root, "tooling/architecture/architecture.config.json");
  const baselinePath = resolve(root, "tooling/architecture/architecture-baseline.json");
  const config = parseJson(configPath);
  const configErrors = validateReviewedEntries(config);
  const { active, reviewed } = analyzeProject(root, config, trackedFiles(root));
  if (process.argv.includes("--write-baseline")) {
    if (configErrors.length)
      throw new Error(`Invalid reviewed policy:\n${configErrors.join("\n")}`);
    writeFileSync(baselinePath, `${JSON.stringify(baselineFrom(active), null, 2)}\n`);
    console.log(`Wrote reviewed baseline to ${normalizePath(relative(root, baselinePath))}`);
    return;
  }
  const baseline = parseJson(baselinePath);
  const approved =
    process.env.CI === "true" &&
    process.env.GITHUB_ACTIONS === "true" &&
    process.env.ARCHITECTURE_REVIEW_APPROVED === "1";
  const previous = readMergeBasePolicy(root);
  const mergeProtection = compareMergeBaseProtection({ baseline, config }, previous, approved);
  if (mergeProtection.bootstrap)
    console.log("Architecture merge-base protection: initial bootstrap");
  const policyFindings = configErrors.map((error) =>
    policyFinding("invalid-reviewed-policy", { error }),
  );
  const freshnessFindings = process.argv.includes("--skip-freshness")
    ? []
    : verifyGeneratedFreshness(root, config);
  const newFindings = [
    ...compareBaseline(active, baseline),
    ...mergeProtection.findings,
    ...policyFindings,
    ...freshnessFindings,
  ];
  report(active, reviewed, newFindings);
  if (newFindings.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
