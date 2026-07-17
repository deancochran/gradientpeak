import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

function isProcessActivityFileMutationHook(node, sourceFile) {
  if (!ts.isCallExpression(node)) return false;
  return /(?:^|\.)activityFiles\.processActivityFile\.useMutation$/.test(
    node.expression.getText(sourceFile).replace(/\s+/g, ""),
  );
}

function propertyName(property, sourceFile) {
  if (!property.name) return null;
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
    return property.name.text;
  }
  return property.name.getText(sourceFile).replace(/^['"]|['"]$/g, "");
}

function payloadHasActivityType(call, sourceFile) {
  const payload = call.arguments[0];
  if (!payload || !ts.isObjectLiteralExpression(payload)) return false;
  return payload.properties.some(
    (property) => propertyName(property, sourceFile) === "activityType",
  );
}

function isDirectProcessActivityFileCall(call, sourceFile) {
  const callee = call.expression.getText(sourceFile).replace(/\s+/g, "");
  return (
    /(?:^|\.)activityFiles\.processActivityFile(?:\.useMutation\(\))?\.(?:mutate|mutateAsync)$/.test(
      callee,
    ) || /(?:^|\.)processActivityFile$/.test(callee)
  );
}

export function findRemovedProcessActivityTypeCallers(source, fileName = "source.ts") {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const mutationVariables = new Set();
  const violations = [];

  function captureMutationVariable(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isProcessActivityFileMutationHook(node.initializer, sourceFile)
    ) {
      mutationVariables.add(node.name.text);
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      isProcessActivityFileMutationHook(node.right, sourceFile)
    ) {
      mutationVariables.add(node.left.text);
    }
    ts.forEachChild(node, captureMutationVariable);
  }
  captureMutationVariable(sourceFile);

  function inspectCalls(node) {
    if (ts.isCallExpression(node) && payloadHasActivityType(node, sourceFile)) {
      const expression = node.expression;
      const capturedVariableCall =
        ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        mutationVariables.has(expression.expression.text) &&
        (expression.name.text === "mutate" || expression.name.text === "mutateAsync");
      if (capturedVariableCall || isDirectProcessActivityFileCall(node, sourceFile)) {
        const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        violations.push({ line: location.line + 1, column: location.character + 1 });
      }
    }
    ts.forEachChild(node, inspectCalls);
  }
  inspectCalls(sourceFile);
  return violations;
}

export function shouldScanExecutableCaller(relativePath) {
  return !(relativePath.includes("/__tests__/") || /\.test\.[cm]?[jt]sx?$/.test(relativePath));
}

function sourceFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    if (["node_modules", ".output", "build", "dist"].includes(name)) return [];
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(?:ts|tsx|js|mjs)$/.test(name)
        ? [path]
        : [];
  });
}

export function scanProductionProcessActivityTypeCallers(root) {
  const violations = [];
  for (const callerRoot of [resolve(root, "apps"), resolve(root, "packages/api")]) {
    for (const path of sourceFiles(callerRoot)) {
      const relativePath = path.slice(root.length + 1);
      if (!shouldScanExecutableCaller(relativePath)) continue;
      for (const location of findRemovedProcessActivityTypeCallers(
        readFileSync(path, "utf8"),
        relativePath,
      )) {
        violations.push({ path: relativePath, ...location });
      }
    }
  }
  return violations;
}
