import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

function isProcessActivityFileMutationHook(node, sourceFile) {
  if (!ts.isCallExpression(node)) return false;
  return /(?:^|\.)activityFiles\.processActivityFile\.useMutation$/.test(
    node.expression.getText(sourceFile).replace(/\s+/g, ""),
  );
}

function staticLiteralString(node) {
  const expression = unwrapExpression(node);
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticLiteralString(expression.left);
    const right = staticLiteralString(expression.right);
    return left === null || right === null ? null : left + right;
  }
  if (ts.isTemplateExpression(expression)) {
    let value = expression.head.text;
    for (const span of expression.templateSpans) {
      const interpolation = staticLiteralString(span.expression);
      if (interpolation === null) return null;
      value += interpolation + span.literal.text;
    }
    return value;
  }
  return null;
}

function propertyName(property, sourceFile) {
  if (!property.name) return null;
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
    return property.name.text;
  }
  if (ts.isComputedPropertyName(property.name)) {
    return staticLiteralString(property.name.expression);
  }
  return property.name.getText(sourceFile).replace(/^['"]|['"]$/g, "");
}

function unwrapExpression(node) {
  let current = node;
  while (
    current &&
    (ts.isAsExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isTypeAssertionExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function objectLiteralHasActivityType(node, sourceFile, isPayloadBinding) {
  return node.properties.some((property) => {
    const name = propertyName(property, sourceFile);
    return (
      name === "activityType" ||
      (!!property.name && ts.isComputedPropertyName(property.name) && name === null) ||
      (ts.isSpreadAssignment(property) &&
        expressionHasActivityTypePayload(property.expression, sourceFile, isPayloadBinding))
    );
  });
}

function expressionHasActivityTypePayload(node, sourceFile, isPayloadBinding) {
  const expression = unwrapExpression(node);
  if (ts.isObjectLiteralExpression(expression)) {
    return objectLiteralHasActivityType(expression, sourceFile, isPayloadBinding);
  }
  if (ts.isIdentifier(expression)) return isPayloadBinding(expression.text);
  if (ts.isConditionalExpression(expression)) {
    return (
      expressionHasActivityTypePayload(expression.whenTrue, sourceFile, isPayloadBinding) ||
      expressionHasActivityTypePayload(expression.whenFalse, sourceFile, isPayloadBinding)
    );
  }
  if (
    ts.isBinaryExpression(expression) &&
    [
      ts.SyntaxKind.AmpersandAmpersandToken,
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.CommaToken,
      ts.SyntaxKind.QuestionQuestionToken,
    ].includes(expression.operatorToken.kind)
  ) {
    return (
      expressionHasActivityTypePayload(expression.left, sourceFile, isPayloadBinding) ||
      expressionHasActivityTypePayload(expression.right, sourceFile, isPayloadBinding)
    );
  }
  return false;
}

function payloadHasActivityType(call, sourceFile, isPayloadBinding) {
  const payload = call.arguments[0];
  if (!payload) return false;
  return expressionHasActivityTypePayload(payload, sourceFile, isPayloadBinding);
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
  const violations = [];

  function createScope(parent, node) {
    return { parent, node, bindings: new Map() };
  }

  function lookupBindingEntry(scope, name) {
    for (let current = scope; current; current = current.parent) {
      const binding = current.bindings.get(name);
      if (binding) return { binding, scope: current };
    }
    return null;
  }

  function lookupBinding(scope, name) {
    return lookupBindingEntry(scope, name)?.binding ?? null;
  }

  function declareBinding(scope, name, kind = "other", staticString = null) {
    const binding = { kind, staticString };
    scope.bindings.set(name, binding);
    return binding;
  }

  function declareBindingName(scope, name, kind = "other") {
    if (ts.isIdentifier(name)) {
      declareBinding(scope, name.text, kind);
      return;
    }
    if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const element of name.elements) {
        if (ts.isBindingElement(element)) declareBindingName(scope, element.name, kind);
      }
    }
  }

  function nearestFunctionScope(scope) {
    for (let current = scope; current; current = current.parent) {
      if (ts.isSourceFile(current.node) || ts.isFunctionLike(current.node)) return current;
    }
    return scope;
  }

  function staticStringValue(node, scope) {
    const literal = staticLiteralString(node);
    if (literal !== null) return literal;
    const expression = unwrapExpression(node);
    if (ts.isIdentifier(expression)) {
      return lookupBinding(scope, expression.text)?.staticString ?? null;
    }
    if (
      ts.isBinaryExpression(expression) &&
      expression.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      const left = staticStringValue(expression.left, scope);
      const right = staticStringValue(expression.right, scope);
      return left === null || right === null ? null : left + right;
    }
    if (ts.isTemplateExpression(expression)) {
      let value = expression.head.text;
      for (const span of expression.templateSpans) {
        const interpolation = staticStringValue(span.expression, scope);
        if (interpolation === null) return null;
        value += interpolation + span.literal.text;
      }
      return value;
    }
    return null;
  }

  function isDirectSynchronousIife(node) {
    if (!ts.isFunctionExpression(node) && !ts.isArrowFunction(node)) return false;
    if (
      node.asteriskToken ||
      node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)
    ) {
      return false;
    }
    let expression = node;
    while (
      expression.parent &&
      (ts.isParenthesizedExpression(expression.parent) ||
        ts.isAsExpression(expression.parent) ||
        ts.isSatisfiesExpression(expression.parent) ||
        ts.isTypeAssertionExpression(expression.parent)) &&
      expression.parent.expression === expression
    ) {
      expression = expression.parent;
    }
    const call = expression.parent;
    if (!ts.isCallExpression(call) || call.expression !== expression) return false;
    if (!ts.isExpressionStatement(call.parent)) return false;
    for (let container = call.parent.parent; container; container = container.parent) {
      if (ts.isSourceFile(container)) return true;
      if (!ts.isBlock(container)) return false;
      if (ts.isFunctionLike(container.parent)) return true;
    }
    return false;
  }

  function isUnconditionalDirectIifeWrite(functionNode, writeNode) {
    if (!isDirectSynchronousIife(functionNode) || !ts.isBlock(functionNode.body)) return false;
    const [firstStatement] = functionNode.body.statements;
    if (!firstStatement || !ts.isExpressionStatement(firstStatement)) return false;
    return unwrapExpression(firstStatement.expression) === writeNode;
  }

  function bindingForWrite(scope, name, writeNode) {
    const entry = lookupBindingEntry(scope, name);
    const functionScope = nearestFunctionScope(scope);
    if (!entry) return declareBinding(functionScope, name);
    if (nearestFunctionScope(entry.scope) === functionScope) return entry.binding;
    if (isUnconditionalDirectIifeWrite(functionScope.node, writeNode)) return entry.binding;
    return (
      functionScope.bindings.get(name) ??
      declareBinding(functionScope, name, entry.binding.kind, entry.binding.staticString)
    );
  }

  function declarationScope(node, scope) {
    return (node.parent.flags & ts.NodeFlags.BlockScoped) !== 0
      ? scope
      : nearestFunctionScope(scope);
  }

  function classifyBindingExpression(node, scope) {
    const expression = unwrapExpression(node);
    if (isProcessActivityFileMutationHook(expression, sourceFile)) return "mutation";
    if (
      expressionHasActivityTypePayload(
        expression,
        sourceFile,
        (name) => lookupBinding(scope, name)?.kind === "payload",
      )
    ) {
      return "payload";
    }
    if (ts.isIdentifier(expression)) {
      return lookupBinding(scope, expression.text)?.kind ?? "other";
    }
    return "other";
  }

  function inspectCall(node, scope) {
    if (
      ts.isCallExpression(node) &&
      payloadHasActivityType(
        node,
        sourceFile,
        (name) => lookupBinding(scope, name)?.kind === "payload",
      )
    ) {
      const expression = node.expression;
      const capturedVariableCall =
        ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        lookupBinding(scope, expression.expression.text)?.kind === "mutation" &&
        (expression.name.text === "mutate" || expression.name.text === "mutateAsync");
      const capturedAliasCall =
        ts.isIdentifier(expression) &&
        lookupBinding(scope, expression.text)?.kind === "mutationAlias";
      if (
        capturedVariableCall ||
        capturedAliasCall ||
        isDirectProcessActivityFileCall(node, sourceFile)
      ) {
        const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        violations.push({ line: location.line + 1, column: location.character + 1 });
      }
    }
  }

  function visit(node, parentScope) {
    if (
      parentScope &&
      ((ts.isFunctionDeclaration(node) && node.name) || (ts.isClassDeclaration(node) && node.name))
    ) {
      declareBinding(parentScope, node.name.text);
    }

    const createsScope =
      ts.isSourceFile(node) ||
      ts.isFunctionLike(node) ||
      ts.isBlock(node) ||
      ts.isModuleBlock(node) ||
      ts.isCatchClause(node);
    const scope = createsScope ? createScope(parentScope, node) : parentScope;
    if (!scope) throw new Error("Legacy caller scan failed to establish lexical scope");

    if (ts.isFunctionLike(node)) {
      for (const parameter of node.parameters) declareBindingName(scope, parameter.name);
    }
    if (ts.isCatchClause(node) && node.variableDeclaration) {
      declareBindingName(scope, node.variableDeclaration.name);
    }

    if (ts.isVariableDeclaration(node)) {
      const targetScope = declarationScope(node, scope);
      const initializer = node.initializer ? unwrapExpression(node.initializer) : null;
      if (ts.isIdentifier(node.name)) {
        const kind = initializer ? classifyBindingExpression(initializer, scope) : "other";
        const staticString = initializer ? staticStringValue(initializer, scope) : null;
        declareBinding(targetScope, node.name.text, kind, staticString);
      } else {
        const initializerIsMutation =
          !!initializer &&
          (isProcessActivityFileMutationHook(initializer, sourceFile) ||
            (ts.isIdentifier(initializer) &&
              lookupBinding(scope, initializer.text)?.kind === "mutation"));
        for (const element of node.name.elements) {
          if (!ts.isBindingElement(element)) continue;
          const sourceName = element.propertyName
            ? ts.isIdentifier(element.propertyName) || ts.isStringLiteral(element.propertyName)
              ? element.propertyName.text
              : element.propertyName.getText(sourceFile).replace(/^['"]|['"]$/g, "")
            : ts.isIdentifier(element.name)
              ? element.name.text
              : null;
          const kind =
            initializerIsMutation && (sourceName === "mutate" || sourceName === "mutateAsync")
              ? "mutationAlias"
              : "other";
          declareBindingName(targetScope, element.name, kind);
        }
      }
    }

    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      if (ts.isIdentifier(node.left)) {
        const staticString = staticStringValue(node.right, scope);
        const binding = bindingForWrite(scope, node.left.text, node);
        binding.kind = classifyBindingExpression(node.right, scope);
        binding.staticString = staticString;
      } else if (
        ts.isPropertyAccessExpression(node.left) &&
        ts.isIdentifier(node.left.expression) &&
        node.left.name.text === "activityType"
      ) {
        const binding = bindingForWrite(scope, node.left.expression.text, node);
        if (binding) binding.kind = "payload";
      } else if (
        ts.isElementAccessExpression(node.left) &&
        ts.isIdentifier(node.left.expression) &&
        node.left.argumentExpression &&
        staticStringValue(node.left.argumentExpression, scope) === "activityType"
      ) {
        const binding = bindingForWrite(scope, node.left.expression.text, node);
        if (binding) binding.kind = "payload";
      }
    }

    inspectCall(node, scope);
    ts.forEachChild(node, (child) => visit(child, scope));
  }

  visit(sourceFile, null);
  return violations;
}

// Negative tests intentionally exercise removed transport fields; production callers may not.
export function shouldScanProductionCaller(relativePath) {
  return !(relativePath.includes("/__tests__/") || /\.test\.[cm]?[jt]sx?$/.test(relativePath));
}

function sourceFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    if (
      [
        "node_modules",
        ".output",
        "build",
        "dist",
        "archive",
        "archives",
        "migrations",
        "migrations-archive",
      ].includes(name)
    ) {
      return [];
    }
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(?:ts|tsx|js|mjs)$/.test(name)
        ? [path]
        : [];
  });
}

// These directories hold immutable historical artifacts, not current source contracts.
const IMMUTABLE_ARCHIVE_DIRECTORIES = new Set([
  "archive",
  "archives",
  "migrations",
  "migrations-archive",
]);

function currentSourceFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    if (
      ["node_modules", ".output", "build", "dist"].includes(name) ||
      IMMUTABLE_ARCHIVE_DIRECTORIES.has(name)
    ) {
      return [];
    }
    return statSync(path).isDirectory()
      ? currentSourceFiles(path)
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
      if (!shouldScanProductionCaller(relativePath)) continue;
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

const fitProtocolFiles = new Set([
  "apps/mobile/lib/services/ActivityRecorder/index.ts",
  "apps/mobile/lib/services/ActivityRecorder/fitRecordWriter.roundtrip.test.ts",
  "apps/mobile/lib/services/ActivityRecorder/lifecycle.jest.test.ts",
  "apps/mobile/lib/services/fit/GarminFitEncoder.test.ts",
  "apps/mobile/lib/services/fit/GarminFitEncoder.ts",
  "apps/web/e2e/activities/fixture-files.ts",
  "apps/web/src/lib/recording/finalized-artifact.test.ts",
  "apps/web/src/lib/recording/finalized-artifact.ts",
  "packages/core/activity-files/__tests__/fit-fixtures.ts",
  "packages/core/lib/fit-sdk-parser.ts",
  "packages/core/server/index.ts",
  "packages/core/server/garmin-workout-fit.test.ts",
  "packages/core/server/garmin-workout-fit.ts",
  "packages/core/server/route-course-fit.test.ts",
  "packages/core/server/route-course-fit.ts",
]);

const tcxProtocolFiles = new Set([
  "packages/core/activity-files/activity-file-parser.test.ts",
  "packages/core/activity-files/activity-file-parser.ts",
]);

const wahooProtocolFiles = new Set([
  "apps/web/src/lib/wahoo-webhook.test.ts",
  "apps/web/src/lib/wahoo-webhook.ts",
  "apps/web/src/routes/api/webhooks/wahoo.ts",
  "packages/api/src/infrastructure/repositories/drizzle-wahoo-repository.ts",
  "packages/api/src/infrastructure/repositories/wahoo-disconnect.live-db.test.ts",
  "packages/api/src/lib/integrations/wahoo/activity-importer.test.ts",
  "packages/api/src/lib/integrations/wahoo/activity-importer.ts",
  "packages/api/src/lib/integrations/wahoo/activity-type-utils.ts",
  "packages/api/src/lib/integrations/wahoo/client.test.ts",
  "packages/api/src/lib/integrations/wahoo/client.ts",
  "packages/api/src/lib/integrations/wahoo/credentials.test.ts",
  "packages/api/src/lib/integrations/wahoo/credentials.ts",
  "packages/api/src/lib/integrations/wahoo/oauth-errors.ts",
  "packages/api/src/lib/integrations/wahoo/plan-converter.test.ts",
  "packages/api/src/lib/integrations/wahoo/plan-converter.ts",
  "packages/api/src/lib/integrations/wahoo/route-converter.test.ts",
  "packages/api/src/lib/integrations/wahoo/route-converter.ts",
  "packages/api/src/lib/integrations/wahoo/sync-service.test.ts",
  "packages/api/src/lib/integrations/wahoo/sync-service.ts",
  "packages/api/src/lib/provider-sync/planned-activities/wahoo-planned-workout-provider.test.ts",
  "packages/api/src/lib/provider-sync/planned-activities/wahoo-planned-workout-provider.ts",
  "packages/api/src/lib/provider-sync/wahoo-activity-history-job-service.test.ts",
  "packages/api/src/lib/provider-sync/wahoo-activity-history-job-service.ts",
  "packages/api/src/lib/provider-sync/wahoo-disconnect-job-service.test.ts",
  "packages/api/src/lib/provider-sync/wahoo-job-service.test.ts",
  "packages/api/src/lib/provider-sync/wahoo-job-service.ts",
  "packages/api/src/lib/provider-sync/wahoo-staging-cleanup.test.ts",
  "packages/api/src/lib/provider-sync/wahoo-staging-cleanup.ts",
  "packages/api/src/lib/provider-sync/wahoo-webhook-job-service.test.ts",
  "packages/api/src/lib/provider-sync/wahoo-webhook-job-service.ts",
  "packages/api/src/repositories/wahoo-repository.ts",
  "packages/api/src/webhooks.ts",
]);

// These provider-sync locations implement Wahoo's externally defined workout resource.
// Keep this narrower than the first-party terminology rule: it permits only the protocol
// token in the adapter/policy locations that exchange or schedule that resource.
const wahooProviderWorkoutProtocolFiles = new Set([
  "packages/api/src/lib/provider-sync/planned-activities/planned-activity-policy.ts",
  "packages/api/src/lib/provider-sync/planned-activities/wahoo-planned-workout-provider.test.ts",
  "packages/api/src/lib/provider-sync/planned-activities/wahoo-planned-workout-provider.ts",
  "packages/api/src/lib/provider-sync/wahoo-staging-cleanup.test.ts",
  "packages/api/src/lib/provider-sync/wahoo-staging-cleanup.ts",
]);

// This accepted Phase-0 checkpoint is pinned by a reviewed SHA-256 digest and
// intentionally retains the policy vocabulary recorded in the accepted
// performance-calibration decisions. Keep the allowance exact-path only: it
// does not authorize legacy terminology in current production contracts.
const performanceCalibrationCheckpointFiles = new Set([
  "packages/core/athlete-inputs/__tests__/fixtures/performance-calibration-goldens.ts",
  "packages/core/athlete-inputs/__tests__/performance-calibration-golden-boundaries.test.ts",
  "packages/core/athlete-inputs/__tests__/performance-calibration-goldens.test.ts",
]);

function isFitProtocolBoundary(relativePath) {
  return fitProtocolFiles.has(relativePath);
}

function isTcxProtocolBoundary(relativePath) {
  return tcxProtocolFiles.has(relativePath);
}

function isWahooProtocolBoundary(relativePath) {
  return wahooProtocolFiles.has(relativePath);
}

function isWahooProviderWorkoutProtocolBoundary(relativePath) {
  return wahooProviderWorkoutProtocolFiles.has(relativePath);
}

const legacyDomainPatterns = [
  [
    /\b(?:activityType|ActivityType|activity_type|activity-type)\b/,
    "first-party activity type; use activity_category or activityCategory",
  ],
  [/\bactivity types?\b/i, "first-party activity-type copy; use activity category"],
  [
    /\b(?:sport_interests|sport_overrides|sport_load_states|sport_loads|lthr_by_sport|goalSport|requiredSport|preferredSport|supportedSports|sportSpecificity|sportDoseLimits|sportMatches|same_sport|sport_mismatch)\b/,
    "first-party sport identifier; use activity-category terminology",
  ],
  [
    /\b(?:sport|sports|workout|workouts)\b/i,
    "first-party sport/workout vocabulary; reserve it for provider or raw protocol boundaries",
  ],
  [
    /\b(?:Sport|sport)[A-Z][A-Za-z0-9_]*\b/,
    "first-party Sport-prefixed symbol; use ActivityCategory terminology",
  ],
  [
    /\b[A-Za-z0-9_]*(?:Workout|workout[A-Z])[A-Za-z0-9_]*\b/,
    "first-party Workout symbol; use Activity or ActivityPlan terminology",
  ],
];

function globalPattern(pattern) {
  return new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
  );
}

function addMatchSpans(spans, line, pattern) {
  const matcher = globalPattern(pattern);
  for (const match of line.matchAll(matcher)) {
    if (match.index === undefined || match[0].length === 0) continue;
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
}

function addContainedTokenSpans(spans, line, pattern, token) {
  const matcher = globalPattern(pattern);
  for (const match of line.matchAll(matcher)) {
    if (match.index === undefined) continue;
    let tokenOffset = match[0].indexOf(token);
    while (tokenOffset >= 0) {
      const start = match.index + tokenOffset;
      spans.push({ start, end: start + token.length });
      tokenOffset = match[0].indexOf(token, tokenOffset + token.length);
    }
  }
}

function addContainedPatternSpans(spans, line, containerPattern, containedPattern) {
  const containerMatcher = globalPattern(containerPattern);
  for (const containerMatch of line.matchAll(containerMatcher)) {
    if (containerMatch.index === undefined) continue;
    const containedMatcher = globalPattern(containedPattern);
    for (const containedMatch of containerMatch[0].matchAll(containedMatcher)) {
      if (containedMatch.index === undefined || containedMatch[0].length === 0) continue;
      const start = containerMatch.index + containedMatch.index;
      spans.push({ start, end: start + containedMatch[0].length });
    }
  }
}

const providerWorkoutProtocolPatterns = [
  /\b(?:sport|sports|workout|workouts)\b/i,
  /\b[A-Za-z0-9_]*(?:Workout|workout[A-Z])[A-Za-z0-9_]*\b/,
];

const wahooActivityTypeAdapterPatterns = [
  /\b(?:activityType|ActivityType|activity-type)\b/,
  /\bactivity types?\b/i,
];

function addProviderIdentifierSpans(spans, source, relativePath, { allowActivityType }) {
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  function visit(node) {
    if (
      isFitProtocolBoundary(relativePath) &&
      ts.isStringLiteral(node) &&
      (node.text === "sport" || node.text === "subSport")
    ) {
      for (let current = node.parent; current; current = current.parent) {
        if (ts.isTypeReferenceNode(current)) {
          const [sourceType] = current.typeArguments ?? [];
          if (
            current.typeName.getText(sourceFile) === "Pick" &&
            sourceType?.getText(sourceFile) === "FitSessionData"
          ) {
            spans.push({ start: node.getStart(sourceFile), end: node.getEnd() });
          }
          break;
        }
        if (ts.isSourceFile(current)) break;
      }
    }
    if (!ts.isIdentifier(node)) {
      ts.forEachChild(node, visit);
      return;
    }
    const value = node.text;
    const isProviderIdentifier =
      /^(?:sport|sports|workout|workouts)$/.test(value) ||
      (isFitProtocolBoundary(relativePath) && /^(?:SPORT|WORKOUT|WORKOUT_STEP)$/.test(value)) ||
      /^(?:Sport|sport)[A-Z][A-Za-z0-9_]*$/.test(value) ||
      /^[A-Za-z0-9_]*(?:Workout|workout[A-Z])[A-Za-z0-9_]*$/.test(value) ||
      (allowActivityType && /^(?:activityType|ActivityType)$/.test(value));
    if (isProviderIdentifier) {
      spans.push({ start: node.getStart(sourceFile), end: node.getEnd() });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function rawSourceFieldNames(targetName) {
  if (targetName === "rawSport" || targetName === "raw_sport") return new Set(["sport"]);
  if (targetName === "rawSubSport" || targetName === "raw_sub_sport") {
    return new Set(["subSport", "sub_sport"]);
  }
  return null;
}

function rawMappingTargetName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && node.argumentExpression) {
    const argument = unwrapExpression(node.argumentExpression);
    if (ts.isStringLiteral(argument)) return argument.text;
  }
  return null;
}

function addRawSourceExpressionSpans(spans, sourceFile, expression, sourceFieldNames) {
  function visit(node) {
    if (ts.isPropertyAccessExpression(node) && sourceFieldNames.has(node.name.text)) {
      spans.push({ start: node.name.getStart(sourceFile), end: node.name.getEnd() });
    } else if (ts.isElementAccessExpression(node) && node.argumentExpression) {
      const argument = unwrapExpression(node.argumentExpression);
      if (ts.isStringLiteral(argument) && sourceFieldNames.has(argument.text)) {
        spans.push({ start: argument.getStart(sourceFile), end: argument.getEnd() });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(expression);
}

function addRawProtocolMappingSpans(spans, source, relativePath) {
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const sourceFieldNames = rawSourceFieldNames(rawMappingTargetName(node.name));
      if (sourceFieldNames) {
        addRawSourceExpressionSpans(spans, sourceFile, node.initializer, sourceFieldNames);
      }
    } else if (ts.isPropertyAssignment(node)) {
      const sourceFieldNames = rawSourceFieldNames(rawMappingTargetName(node.name));
      if (sourceFieldNames) {
        addRawSourceExpressionSpans(spans, sourceFile, node.initializer, sourceFieldNames);
      }
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const sourceFieldNames = rawSourceFieldNames(rawMappingTargetName(node.left));
      if (sourceFieldNames) {
        addRawSourceExpressionSpans(spans, sourceFile, node.right, sourceFieldNames);
      }
    } else if (ts.isBindingElement(node) && node.propertyName) {
      const sourceFieldNames = rawSourceFieldNames(rawMappingTargetName(node.name));
      const sourceName = rawMappingTargetName(node.propertyName);
      if (sourceFieldNames?.has(sourceName)) {
        spans.push({
          start: node.propertyName.getStart(sourceFile),
          end: node.propertyName.getEnd(),
        });
      }
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "profileLabel"
    ) {
      const [labelArgument, rawArgument] = node.arguments;
      const label = labelArgument ? unwrapExpression(labelArgument) : null;
      const sourceFieldNames = rawArgument
        ? rawSourceFieldNames(rawMappingTargetName(unwrapExpression(rawArgument)))
        : null;
      if (label && ts.isStringLiteral(label) && sourceFieldNames?.has(label.text)) {
        spans.push({ start: label.getStart(sourceFile), end: label.getEnd() });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function addProtocolContextSpans(spans, line, contexts, patterns) {
  for (const context of contexts) {
    for (const pattern of patterns) addContainedPatternSpans(spans, line, context, pattern);
  }
}

const wahooWorkoutProtocolContexts = [
  /\bWahoo (?:plan and )?workout resources?\b/i,
  /\bWahoo workouts? (?:calendar entr(?:y|ies)|details?|history|ID|identity|page response|response|scheduled|starts response|summaries|summary|total response|type)\b/i,
];

const wahooActivityTypeProtocolContexts = [
  /\bWahoo (?:integration )?activity type(?: format| semantics)?\b/i,
];

const fitProtocolContexts = [
  /\b(?:Garmin )?FIT (?:sport|sub-sport|workouts?)(?: (?:file|files|message|messages|percentages|round trip|SDK|session|sessions|step|steps|strings|value|values))?\b/i,
  /\bFIT SDK (?:sport|sub-sport|workouts?)(?: (?:enum|message|messages|value|values))?\b/i,
];

function allowedLegacyTerminologyLineSpans(relativePath, line) {
  const spans = [];

  const isFitBoundary = isFitProtocolBoundary(relativePath);
  const isWahooBoundary = isWahooProtocolBoundary(relativePath);
  const isWahooProviderWorkoutBoundary = isWahooProviderWorkoutProtocolBoundary(relativePath);
  if (isWahooBoundary) {
    addProtocolContextSpans(
      spans,
      line,
      wahooWorkoutProtocolContexts,
      providerWorkoutProtocolPatterns,
    );
    addProtocolContextSpans(
      spans,
      line,
      wahooActivityTypeProtocolContexts,
      wahooActivityTypeAdapterPatterns,
    );
  }
  if (isWahooProviderWorkoutBoundary) {
    addMatchSpans(spans, line, /\bworkout\b/i);
  }
  if (isFitBoundary) {
    addProtocolContextSpans(spans, line, fitProtocolContexts, providerWorkoutProtocolPatterns);
    addContainedTokenSpans(spans, line, /\bSport\s*=\s*["'][^"']+["']/, "Sport");
    addContainedTokenSpans(spans, line, /\bFIT_FILE_TYPE_WORKOUT\s*=\s*["']workout["']/, "workout");
  }
  if (isTcxProtocolBoundary(relativePath)) {
    addContainedTokenSpans(spans, line, /\bSport\s*=\s*["'][^"']+["']/, "Sport");
    addContainedTokenSpans(spans, line, /getAttribute\(\s*["']Sport["']\s*\)/, "Sport");
  }
  if (/^\s*(?:import|export)\b.*["'][^"']*(?:wahoo|garmin)[^"']*["']/.test(line)) {
    addContainedTokenSpans(spans, line, /["'][^"']*(?:wahoo|garmin)[^"']*["']/, "workout");
    addContainedTokenSpans(spans, line, /["'][^"']*(?:wahoo|garmin)[^"']*["']/, "sport");
  }
  addContainedTokenSpans(
    spans,
    line,
    /["'`][^"'`]*\/v1\/workouts(?:[/?][^"'`]*)?["'`]/,
    "workouts",
  );
  addContainedTokenSpans(spans, line, /["'][^"']*activity-type-utils[^"']*["']/, "activity-type");
  addContainedTokenSpans(spans, line, /["'][^"']*garmin-workout-fit[^"']*["']/, "workout");
  if (isWahooBoundary) {
    addContainedTokenSpans(spans, line, /\bwahoo-workout-\d+\b/, "workout");
    addContainedTokenSpans(spans, line, /https?:\/\/[^"'\s]+\/workout\.fit\b/, "workout");
    addMatchSpans(spans, line, /\bWahoo[A-Za-z0-9_]*Workout[A-Za-z0-9_]*\b/);
  }
  if (isFitBoundary) {
    addContainedTokenSpans(spans, line, /\btype\s*:\s*["']workout["']/, "workout");
  }
  addContainedTokenSpans(spans, line, /https:\/\/provider\.test\/private\/workout\//, "workout");
  if (isFitProtocolBoundary(relativePath)) {
    addMatchSpans(spans, line, /\bsportLabel\b/);
  }

  for (const rawPhrase of [
    /\braw[- ]sport\b/i,
    /\braw[- ]sub-sport\b/i,
    /\braw type, sport, or sub-sport\b/i,
  ]) {
    addContainedTokenSpans(spans, line, rawPhrase, "sport");
  }

  if (relativePath === "apps/mobile/lib/services/ActivityRecorder/location.ts") {
    addMatchSpans(spans, line, /\bactivityType(?=\s*:\s*Location\.ActivityType\.)/);
    addContainedTokenSpans(
      spans,
      line,
      /\bLocation\.ActivityType\.[A-Za-z0-9_]+\b/,
      "ActivityType",
    );
  }

  if (/\.test\.[cm]?[jt]sx?$/.test(relativePath)) {
    addContainedTokenSpans(spans, line, /not\.toHaveProperty\(\s*["']sport["']\s*\)/, "sport");
    addContainedTokenSpans(
      spans,
      line,
      /queryByLabelText\(\s*["']Activity type["']\s*\)/,
      "Activity type",
    );
  }

  return spans;
}

function allowedLegacyTerminologySpans(source, relativePath) {
  const spans = [];
  if (performanceCalibrationCheckpointFiles.has(relativePath)) {
    for (const [pattern] of legacyDomainPatterns) addMatchSpans(spans, source, pattern);
  }
  const isFitBoundary = isFitProtocolBoundary(relativePath);
  const isWahooBoundary = isWahooProtocolBoundary(relativePath);
  if (isFitBoundary || isWahooBoundary) {
    addProviderIdentifierSpans(spans, source, relativePath, {
      allowActivityType: isWahooBoundary,
    });
  }
  addRawProtocolMappingSpans(spans, source, relativePath);

  let lineStart = 0;
  for (const line of source.split("\n")) {
    for (const span of allowedLegacyTerminologyLineSpans(relativePath, line)) {
      spans.push({ start: lineStart + span.start, end: lineStart + span.end });
    }
    lineStart += line.length + 1;
  }
  return spans;
}

function isAllowedMatch(match, spans, lineStart) {
  const start = lineStart + (match.index ?? 0);
  const end = start + match[0].length;
  return spans.some((span) => start >= span.start && end <= span.end);
}

export function findLegacyDomainTerminology(source, relativePath = "source.ts") {
  const violations = [];
  const allowedSpans = allowedLegacyTerminologySpans(source, relativePath);
  let lineStart = 0;
  for (const [index, line] of source.split("\n").entries()) {
    for (const [pattern, description] of legacyDomainPatterns) {
      for (const match of line.matchAll(globalPattern(pattern))) {
        if (isAllowedMatch(match, allowedSpans, lineStart)) continue;
        violations.push({
          line: index + 1,
          column: (match.index ?? 0) + 1,
          description,
        });
      }
    }
    lineStart += line.length + 1;
  }
  return violations;
}

export function scanCanonicalDomainTerminology(root) {
  const violations = [];
  for (const sourceRoot of [resolve(root, "apps"), resolve(root, "packages")]) {
    for (const path of sourceFiles(sourceRoot)) {
      const relativePath = path.slice(root.length + 1);
      for (const violation of findLegacyDomainTerminology(
        readFileSync(path, "utf8"),
        relativePath,
      )) {
        violations.push({ path: relativePath, ...violation });
      }
    }
  }
  return violations;
}

const deletedFiles = [
  "packages/api/src/application/activity-file-ingestion/persist-new-activity-file-import.ts",
  "packages/api/src/application/activity-file-ingestion/persist-existing-activity-file-enrichment.ts",
  "packages/core/activity-plan/v2.ts",
  "packages/core/activity-plan/legacy-parser.ts",
  "packages/api/src/application/activity-file-ingestion/reconcile-parsed-activity-file-evidence.ts",
  "packages/core/plan/dailyRecommendedLoad.ts",
  "packages/core/plan/plannedActivityExportCompatibility.ts",
  "apps/mobile/app/(internal)/(standard)/create-activity-plan-repeat.tsx",
  "apps/mobile/app/(internal)/(standard)/create-activity-plan-structure.tsx",
  "apps/mobile/components/charts/FitnessProjectionChart.tsx",
  "apps/mobile/components/training-plan/modals/AddActivityModal.tsx",
  "apps/mobile/components/training-plan/modals/components/ConstraintValidator.tsx",
  "apps/mobile/components/training-plan/AdvancedConfigSheet.tsx",
  "apps/mobile/lib/auth/auth-client.ts",
  "apps/mobile/lib/auth/request-auth.ts",
  "apps/mobile/lib/services/ActivityRecorder/coreRecorderObserver.ts",
  "apps/mobile/lib/utils/plan/dateGrouping.ts",
  "apps/mobile/components/settings/TrainingPreferencesProjectionPreview.tsx",
  "apps/mobile/components/training-plan/create/BuilderLoadProjectionSummary.tsx",
  "apps/mobile/components/training-plan/create/BuilderPublishedProjectionCard.tsx",
  "apps/mobile/components/training-plan/create/BuilderSchedulePreviewSheetContent.tsx",
  "apps/mobile/components/training-plan/create/SinglePageForm.tsx",
  "apps/mobile/lib/training-plan-creation/local-projection.ts",
  "apps/mobile/lib/training-plan-creation/planning-session-engine.ts",
  "apps/mobile/lib/training-plan-creation/planning-session.ts",
  "apps/mobile/lib/training-plan-creation/scheduling-preview.ts",
  "apps/mobile/lib/training-plan-creation/structure-proposal.ts",
  "apps/mobile/lib/training-plan-creation/validation.ts",
  "apps/mobile/lib/training-plan-creation/view-model.ts",
  "apps/mobile/lib/training-plan-form/localPreview.ts",
  "apps/mobile/lib/training-plan-form/projectionPreview.ts",
  "packages/core/plan/deriveCreationSuggestions.ts",
  "packages/core/plan/formValidation.ts",
  "packages/core/plan/planningProjection.ts",
  "packages/core/plan/trainingPlanCreationPreview.ts",
  "packages/core/plan/trainingPlanCreationValidation.ts",
  "packages/core/plan/trainingPlanSchedulingPreview.ts",
  "packages/core/plan/trainingPlanStructureProposal.ts",
  "packages/core/plan/planningCanonicalStructure.ts",
  "packages/core/plan/planningContext.ts",
  "packages/core/contracts/training-plan-creation/index.ts",
  "packages/core/contracts/training-plan-creation/schemas.ts",
  "apps/mobile/lib/training-plan-creation/mappers.ts",
  "apps/mobile/lib/training-plan-creation/planning-context.ts",
  "apps/mobile/lib/training-plan-creation/schemas.ts",
  "packages/api/src/routers/planning/training-plans/effective-load.ts",
  "apps/web/src/components/training-plan/training-plan-activity-reorder.tsx",
  "apps/web/src/routes/_protected/training-plans/reorder.tsx",
];

const pathScopedRetiredSymbolChecks = [
  {
    paths: ["packages/core/schemas/planned_activity.ts"],
    patterns: [
      [
        /\b(?:eventRecurrenceExceptionSchema|persistableEventRecurrenceSchema|eventLifecycleSchema|importedEventDomainSchema|importedEventLifecycleMutationSchema|importedEventSourceMetadataSchema|plannedActivityUpdateSchema|plannedActivityRescheduleSchema)\b/,
        "removed event compatibility contract",
      ],
      [/\b(?:read_only|rest_day)\b|["']imported["']/, "removed event compatibility value"],
    ],
  },
  {
    paths: ["packages/core/athlete-inputs/profile-metrics.ts"],
    patterns: [[/["']lthr["']/, "removed profile-metric LTHR authority"]],
  },
  {
    paths: ["packages/core/schemas/index.ts"],
    patterns: [[/\bis_active\s*:/, "removed training-plan write is_active field"]],
  },
  {
    paths: ["packages/api/src/routers/events.ts"],
    patterns: [[/\bvalidateConstraints\s*:/, "removed event constraint preflight route"]],
  },
  {
    paths: ["packages/api/src/routers/activity-plans.ts"],
    patterns: [[/\bincludeEstimation\b/, "removed activity-plan estimation flag"]],
  },
  {
    paths: ["packages/api/src/routers/planning/training-plans/base.ts"],
    patterns: [
      [/\bgetById\s*:/, "removed training-plan getById alias"],
      [/\bgetActivePlan\s*:/, "removed training-plan active-plan read"],
      [/\breorderActivities\s*:/, "removed training-plan schedule reorder proxy"],
    ],
  },
  {
    paths: ["packages/api/src/routers/planning/training-plans/index.ts"],
    patterns: [[/\bgetEffectiveLoad\s*:/, "removed training-plan effective-load route"]],
  },
  {
    paths: ["packages/api/src/application/training-plan/crudUseCases.ts"],
    patterns: [[/\bgetTrainingPlanByIdUseCase\b/, "removed training-plan read alias"]],
  },
  {
    paths: ["packages/api/src/application/training-plan/appliedScheduleUseCases.ts"],
    patterns: [[/\bgetActivePlanUseCase\b/, "removed training-plan active-plan use case"]],
  },
  {
    paths: ["packages/api/src/query-client.ts"],
    patterns: [
      [/\["trainingPlans",\s*"getActivePlan"\]/, "removed training-plan active-plan cache key"],
      [/\["events",\s*"validateConstraints"\]/, "removed event constraint preflight cache key"],
    ],
  },
  {
    paths: ["apps/mobile/components/ScheduleActivityModal.tsx"],
    patterns: [
      [/\brecurrence\b/, "removed planned-session recurrence UI"],
      [/\btrainingPlanId\b/, "removed client-authored training-plan schedule linkage"],
    ],
  },
  {
    paths: ["packages/db/src/schema/enums.ts"],
    patterns: [
      [/eventTypeEnum[^;]*["']imported["']/, "removed imported event enum value"],
      [/profileMetricTypeEnum[^;]*["']lthr["']/, "removed profile-metric LTHR enum value"],
    ],
  },
  {
    paths: ["packages/db/src/schema/tables.ts"],
    patterns: [
      [
        /\b(?:read_only|source_provider|integration_account_id|external_calendar_id|external_event_id)\s*:/,
        "removed event compatibility column",
      ],
    ],
  },
  {
    paths: ["packages/db/supabase/migrations/20260730000000_mvp_baseline.sql"],
    patterns: [
      [
        /CREATE TYPE "public"\."event_type"[^;]*'imported'/,
        "removed imported event baseline enum value",
      ],
      [
        /CREATE TYPE "public"\."profile_metric_type"[^;]*'lthr'/,
        "removed profile-metric LTHR baseline enum value",
      ],
      [
        /CREATE TABLE "events" \((?:(?!\n\);)[\s\S])*?"(?:read_only|source_provider|integration_account_id|external_calendar_id|external_event_id|lifecycle|recurrence|payload)"\s+(?:boolean|text|uuid|jsonb)/,
        "removed event compatibility baseline column",
      ],
    ],
  },
  {
    paths: ["packages/core/activity-segments/completed-segment-schema.ts"],
    patterns: [
      [/\b(?:segmentSummarySchema|SegmentSummary)\b/, "removed segment summary compatibility name"],
      [
        /\b(?:normalizedPowerWatts|normalizedGradedSpeedMetersPerSecond|efficiencyFactor|aerobicDecoupling)\s*(?:\?|:)/,
        "removed completed-segment scalar compatibility field",
      ],
    ],
  },
  {
    paths: ["packages/core/recording-metrics/contracts.ts"],
    patterns: [
      [
        /\b(?:normalizedPowerWatts|normalizedGradedSpeedMetersPerSecond|efficiencyFactor|aerobicDecoupling)\s*(?:\?|:)/,
        "removed provisional-metrics scalar compatibility field",
      ],
    ],
  },
  {
    paths: [
      "packages/core/activity-analysis/stress.ts",
      "packages/core/activity-analysis/observation-quantification.ts",
    ],
    patterns: [
      [
        /\b(?:normalized_power|normalized_graded_speed_mps|normalizedPowerWatts|normalizedGradedSpeedMetersPerSecond|efficiencyFactor|aerobicDecoupling)\s*(?:\?|:)/,
        "removed activity-analysis scalar compatibility field",
      ],
    ],
  },
  {
    paths: ["packages/core/athlete-intelligence/model-input-contracts.ts"],
    patterns: [
      [/\bnormalizedPowerWatts\s*(?:\?|:)/, "removed athlete-model Normalized Power scalar field"],
    ],
  },
  {
    paths: [
      "packages/api/src/application/activity-file-ingestion/stream-derived-calculations.ts",
      "packages/api/src/application/activity-file-ingestion/analyze-parsed-activity-file.ts",
    ],
    patterns: [
      [
        /\b(?:normalizedPower|normalizedGradedSpeed|efficiencyFactor|aerobicDecoupling|normalized_graded_speed_mps|efficiency_factor|aerobic_decoupling)\s*(?:\?|:)/,
        "removed ingestion scalar compatibility field",
      ],
    ],
  },
  {
    paths: ["packages/api/src/application/activities/submit-activity.ts"],
    patterns: [
      [
        /\b(?:normalizedGradedSpeedMps|efficiencyFactor|aerobicDecoupling)\s*(?:\?|:)/,
        "removed activity-submission scalar compatibility field",
      ],
    ],
  },
  {
    directory: "packages/core/calculations",
    patterns: [[/\bestimateWPrime\b/, "removed demographic W′ estimate API"]],
  },
  {
    paths: ["packages/core/plan/projectionCalculations.ts"],
    patterns: [
      [/\bbuildDeterministicProjectionPayload\b/, "removed projection-calculation export facade"],
    ],
  },
  {
    directory: "packages/core/plan",
    patterns: [
      [
        /\b(?:DailyRecommendedLoad|buildDailyRecommendedLoad)\b/,
        "removed daily recommendation facade",
      ],
      [/\bgetActivityPlanProviderReadiness\b/, "removed provider-readiness facade"],
      [
        /\b(?:PlannedActivityExportCompatibility|getPlannedActivityExportCompatibility)\b/,
        "removed planned export compatibility facade",
      ],
      [
        /\b(?:deriveCreationSuggestions|validateTrainingPlanForm|derivePlanningProjection|deriveTrainingPlanCreationPreview|validateTrainingPlanCreationInput|deriveTrainingPlanSchedulingPreview|deriveTrainingPlanStructureProposal)\b/,
        "removed local training-plan preview or validation API",
      ],
    ],
  },
  {
    paths: ["packages/core/integrations/provider-capabilities.ts"],
    patterns: [
      [/\bIntegrationProviderId\b/, "removed broad executable provider identity alias"],
      [
        /\b(?:strava|trainingpeaks|garmin|zwift)\s*:\s*\{/,
        "removed non-Wahoo executable provider capability definition",
      ],
      [
        /\bevidenceGatedPlannedActivities\b|["']evidence_gated["']|["']completed_activity_push["']/,
        "removed unsupported-provider readiness placeholder",
      ],
    ],
  },
  {
    directory: "packages",
    patterns: [
      [
        /\b(?:getProviderCapabilityDefinition|getProviderPlannedActivityCapability|providerHasCapability|getProviderCapabilityUnavailableReason|getProviderSyncMode|getConfigurableProviderActions|isProviderActivityHistoryReconciliationTarget)\(\s*["'](?:strava|trainingpeaks|garmin|zwift)["']/,
        "unsupported provider passed to executable capability helper",
      ],
      [
        /\bgetProvidersWithCapability\(\s*\[[^\]]*["'](?:strava|trainingpeaks|garmin|zwift)["']/,
        "unsupported provider passed to executable capability helper",
      ],
    ],
  },
  {
    directory: "apps",
    patterns: [
      [
        /\b(?:getProviderCapabilityDefinition|getProviderPlannedActivityCapability|providerHasCapability|getProviderCapabilityUnavailableReason|getProviderSyncMode|getConfigurableProviderActions|isProviderActivityHistoryReconciliationTarget)\(\s*["'](?:strava|trainingpeaks|garmin|zwift)["']/,
        "unsupported provider passed to executable capability helper",
      ],
      [
        /\bgetProvidersWithCapability\(\s*\[[^\]]*["'](?:strava|trainingpeaks|garmin|zwift)["']/,
        "unsupported provider passed to executable capability helper",
      ],
    ],
  },
  {
    directory: "packages/api/src/application/training-plan",
    patterns: [
      [
        /\breorderTrainingPlanActivitiesUseCase\b/,
        "removed training-plan schedule reorder use case",
      ],
    ],
  },
  {
    directory: "apps/web",
    patterns: [
      [
        /\b(?:createScheduleAndReorderTrainingPlan|TrainingPlanActivityReorder)\b|trainingPlans\.reorderActivities|training-plans\.reorder|\/training-plans\/reorder/,
        "removed training-plan schedule reorder surface",
      ],
    ],
  },
  {
    paths: ["packages/core/contracts/index.ts", "packages/core/schemas/form-schemas.ts"],
    patterns: [
      [
        /\b(?:creationConfigValueSchema|creationNormalizationInputSchema|postCreateBehaviorSchema|trainingPlanCreationProvenanceFormSchema|trainingPlanCreationConfigFormSchema)\b|\.\/training-plan-creation/,
        "removed training-plan creation wrapper contract",
      ],
    ],
  },
  {
    directory: "packages/core/schemas",
    patterns: [
      [
        /\b(?:planningActivityCategorySchema|PlanningActivityCategory)\b/,
        "removed planning activity-category alias",
      ],
    ],
  },
  {
    directory: "packages/core/athlete-intelligence",
    patterns: [[/\bsessionRpeEvidence\s*:/, "removed session-RPE placeholder"]],
  },
  {
    paths: [
      "packages/core/schemas/goals/profile_goals.ts",
      "packages/core/utils/fitness-inputs.ts",
    ],
    patterns: [
      [/\bheart_rate_reserve(?:_bpm)?\b/, "removed first-party heart-rate-reserve identity"],
    ],
  },
  {
    directory: "packages/api/src/lib/provider-sync",
    patterns: [
      [/\bactivity-segments-v1\b/, "retired provider materializer version"],
      [
        /\b(?:replayParsedActivityFileEvidenceProfile|reconcileParsedActivityFileEvidence)\b/,
        "removed provider replay/reconcile materializer path",
      ],
    ],
  },
  {
    directory: "packages/core/notifications",
    patterns: [[/\bis_read\b/, "removed notification is_read consumer shape"]],
  },
  {
    paths: ["packages/core/schemas/onboarding.ts"],
    patterns: [
      [
        /\bbaseline_field_sources\s*:\s*onboardingBaselineFieldSourcesSchema\.optional\(\)/,
        "removed optional onboarding provenance marker",
      ],
    ],
  },
  {
    directory: "apps/mobile/components",
    patterns: [
      [
        /\b(?:FitnessProjectionChart|FitnessProjectionChartProps)\b/,
        "removed mobile FitnessProjection chart",
      ],
      [/\bResourcePickerSelectionItem\b/, "removed resource-picker compatibility item"],
      [/\blegacy_read_only\b/, "removed legacy composer state"],
    ],
  },
  {
    directory: "apps/mobile/lib",
    patterns: [
      [
        /\b(?:computeLocalCreationPreview|buildTrainingPreferencesProjectionPreview|deriveDraftPlanProjection|selectSaveReadiness|selectActiveTrainingPlanProjection|deriveTrainingPathProjectionStatus)\b/,
        "removed local training-plan preview or save-readiness path",
      ],
    ],
  },
  {
    paths: ["apps/mobile/components/plan/training-path/trainingPathUtils.ts"],
    patterns: [
      [
        /\b(?:allowLegacyTssProjection|buildScheduledFitnessTrend)\b/,
        "removed legacy-TSS replay path",
      ],
    ],
  },
  {
    directory: "apps/mobile/lib/services/ActivityRecorder",
    patterns: [
      [
        /\b(?:CoreRecorderReducerObserver|ObservedCoreRecorderLifecycleState|ObservedRecorderDecision)\b/,
        "removed recorder observer",
      ],
    ],
  },
  {
    directory: "apps/mobile/lib/auth",
    patterns: [
      [/\bgetAuthClient\b/, "removed duplicate mobile auth client"],
      [
        /\b(?:getAuthHeaders|getAuthTransport|MobileAuthBootstrapSource|MobileAuthTransport)\b/,
        "removed duplicate request-auth path",
      ],
    ],
  },
];

function isExplicitNegativeTest(relativePath) {
  return (
    relativePath.includes("/__tests__/") || /\.(?:test|spec|jest)\.[cm]?[jt]sx?$/.test(relativePath)
  );
}

function activeContractSourceFiles(root, check) {
  const paths = check.paths
    ? check.paths.map((path) => resolve(root, path))
    : currentSourceFiles(resolve(root, check.directory));
  return paths.filter((path) => {
    const relativePath = path.slice(root.length + 1);
    return existsSync(path) && !isExplicitNegativeTest(relativePath);
  });
}

export function scanPathScopedRetiredSymbols(root) {
  const violations = [];
  for (const check of pathScopedRetiredSymbolChecks) {
    for (const path of activeContractSourceFiles(root, check)) {
      const relativePath = path.slice(root.length + 1);
      const content = readFileSync(path, "utf8");
      for (const [pattern, description] of check.patterns) {
        if (pattern.test(content)) violations.push(`${relativePath}: ${description}`);
      }
    }
  }
  return violations;
}

const currentContractFileChecks = [
  {
    path: "packages/api/src/application/activities/submit-activity.ts",
    patterns: [
      [/\bdurationSeconds\s*:/, "legacy activity duration transport field"],
      [/\bmovingSeconds\s*:/, "legacy activity moving transport field"],
      [/\bactivityType\s*:/, "legacy parent activity type transport field"],
      [/\bactivityFilePath\s*:/, "removed parent activity file path field"],
      [/\bactivityFileSize\s*:/, "removed parent activity file size field"],
      [/\bactivityFileType\s*:/, "removed parent activity file type field"],
      [/\bimportSource\s*:/, "removed parent import source field"],
      [/\bimportFileType\s*:/, "removed parent import file type field"],
      [/\bimportOriginalFileName\s*:/, "removed parent import original-name field"],
      [/\bcanonical-submission-v0\b/, "retired persisted parser version"],
      [/\bdecoded-activity-artifact-v0\b/, "retired decoded-contract version"],
      [/\bactivity-segments-v1\b/, "retired activity materializer version"],
    ],
  },
  {
    path: "packages/api/src/routers/activity-files.ts",
    patterns: [[/activityType:\s*z\./, "legacy processActivityFile activityType input"]],
  },
  {
    path: "packages/db/src/schema/tables.ts",
    patterns: [
      [/\bactivity_file_path\b/, "deleted activity file path column"],
      [/\bactivity_file_size\b/, "deleted activity file size column"],
      [/\bmoving_seconds\b/, "deleted parent moving seconds column"],
      [/\bimport_original_file_name\b/, "deleted parent import metadata column"],
    ],
  },
];

const retiredSourcePatterns = [
  [/\bparseLegacyActivityPlan\b/, "legacy plan parser"],
  [/\bactivityPlanV2\b/, "V2 activity plan symbol"],
  [/profiles\/\$\{[^}]+\}\/sha256/, "retired artifact storage key"],
];

const obsoleteFreshOnlyDbPaths = [
  "packages/db/scripts/check-migration-ledger.ts",
  "packages/db/scripts/contract_activity_extension_tables.sql",
  "packages/db/scripts/contract_event_extension_tables.sql",
  "packages/db/scripts/autocommit-migration.test.ts",
  "packages/db/scripts/_migration-operations.ts",
  "packages/db/scripts/_migration-plan.ts",
  "packages/db/scripts/_supabase-cli-wrapper.ts",
  "packages/db/scripts/migration-workflow.ts",
  "packages/db/scripts/migration-workflow.test.ts",
  "packages/db/scripts/migration-operation-safety.test.ts",
  "packages/db/scripts/sync-migration-mirror.ts",
  "packages/db/scripts/sync-migration-mirror.test.ts",
  "packages/db/scripts/verify-supabase-cli-concurrent-migration.ts",
  "packages/db/scripts/verify-forward-upgrade.ts",
];

const freshOnlyDbGuidanceChecks = [
  {
    path: "packages/db/README.md",
    patterns: [
      [/generation-\d+ baseline.*forward chain/i, "obsolete DB forward-chain guidance"],
      [/ordered hashed forward chain/i, "obsolete DB forward-chain guidance"],
    ],
  },
  {
    path: "packages/db/drizzle/AGENTS.md",
    patterns: [
      [/forward database migrations/i, "obsolete DB forward-migration guidance"],
      [/split backfill/i, "obsolete DB backfill guidance"],
      [/upgrade workflow/i, "obsolete DB upgrade guidance"],
    ],
  },
];

export function scanFreshOnlyDbWorkflow(root) {
  const violations = [];
  for (const path of obsoleteFreshOnlyDbPaths) {
    if (existsSync(resolve(root, path)))
      violations.push(`${path}: obsolete active DB workflow path exists`);
  }

  for (const check of freshOnlyDbGuidanceChecks) {
    const path = resolve(root, check.path);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf8");
    for (const [pattern, description] of check.patterns) {
      if (pattern.test(content)) violations.push(`${check.path}: ${description}`);
    }
  }

  for (const packagePath of ["package.json", "packages/db/package.json"]) {
    const path = resolve(root, packagePath);
    if (!existsSync(path)) continue;
    const scripts = JSON.parse(readFileSync(path, "utf8")).scripts ?? {};
    for (const [name, command] of Object.entries(scripts)) {
      if (name.startsWith("db:migration:") || String(command).includes("db:migration:")) {
        violations.push(`${packagePath}: obsolete db:migration command ${name}`);
      }
      if (
        /forward-upgrade|autocommit-migration|migration-workflow|sync-migration-mirror/.test(
          String(command),
        )
      ) {
        violations.push(`${packagePath}: obsolete DB workflow command ${name}`);
      }
    }
  }
  return violations;
}

export function scanCurrentContracts(root) {
  const violations = [];
  for (const path of deletedFiles) {
    if (existsSync(resolve(root, path))) violations.push(`${path}: deleted legacy file exists`);
  }

  for (const check of currentContractFileChecks) {
    const target = resolve(root, check.path);
    if (!existsSync(target)) {
      violations.push(`${check.path}: current-contract route is missing`);
      continue;
    }
    const content = readFileSync(target, "utf8");
    for (const [pattern, description] of check.patterns) {
      if (pattern.test(content)) violations.push(`${check.path}: ${description}`);
    }
  }

  const activityFilesPath = resolve(root, "packages/api/src/routers/activity-files.ts");
  if (existsSync(activityFilesPath)) {
    const activityFilesSource = readFileSync(activityFilesPath, "utf8");
    const parserBoundary = activityFilesSource.slice(
      activityFilesSource.indexOf("const blobLikeSchema"),
      activityFilesSource.indexOf("const getStreamsOutputSchema"),
    );
    if (parserBoundary.includes(".passthrough()")) {
      violations.push("packages/api/src/routers/activity-files.ts: permissive parser boundary");
    }
  }

  for (const path of currentSourceFiles(resolve(root, "packages"))) {
    const content = readFileSync(path, "utf8");
    for (const [pattern, description] of retiredSourcePatterns) {
      if (pattern.test(content)) violations.push(`${path.slice(root.length + 1)}: ${description}`);
    }
  }

  for (const violation of scanProductionProcessActivityTypeCallers(root)) {
    violations.push(
      `${violation.path}:${violation.line}:${violation.column}: removed processActivityFile activityType transport field in caller`,
    );
  }
  for (const violation of scanCanonicalDomainTerminology(root)) {
    violations.push(
      `${violation.path}:${violation.line}:${violation.column}: ${violation.description}`,
    );
  }
  violations.push(...scanPathScopedRetiredSymbols(root));
  violations.push(...scanFreshOnlyDbWorkflow(root));
  return violations;
}
