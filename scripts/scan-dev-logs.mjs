#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const logsDir = path.join(repoRoot, ".logs");

const severities = ["critical", "high", "medium"];

const severityPatterns = {
  critical: /panic|FATAL|UnhandledPromiseRejection|SIGSEGV|migration failed/i,
  high: /TypeError|ReferenceError|Cannot read|TRPCError|\b500\b|EADDRINUSE|ECONNREFUSED/i,
  medium: /warn|deprecated|timeout|retrying/i,
};

function usage() {
  console.log(`Usage: node scripts/scan-dev-logs.mjs [options]

Options:
  --since <minutes>      Look at logs modified within this window (default: 10)
  --json                 Output JSON instead of text
  --files <csv>          Restrict scan to specific log files (e.g. web.log,core.log)
  --fail-on-high         Exit non-zero when high or critical matches are found
  --help                 Show this help message`);
}

function parseArgs(argv) {
  const options = {
    sinceMinutes: 10,
    json: false,
    files: null,
    failOnHigh: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help") {
      usage();
      process.exit(0);
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--fail-on-high") {
      options.failOnHigh = true;
      continue;
    }

    if (arg === "--since") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --since");
      }
      const minutes = Number(value);
      if (!Number.isFinite(minutes) || minutes < 0) {
        throw new Error("--since must be a non-negative number");
      }
      options.sinceMinutes = minutes;
      i += 1;
      continue;
    }

    if (arg === "--files") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --files");
      }
      options.files = value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => (entry.endsWith(".log") ? entry : `${entry}.log`));
      i += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function classify(line) {
  for (const severity of severities) {
    if (severityPatterns[severity].test(line)) {
      return severity;
    }
  }
  return null;
}

function sanitizeSignature(line) {
  return line
    .replace(/\s+/g, " ")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, "<timestamp>")
    .trim()
    .slice(0, 180);
}

function ensureLogsDirExists() {
  if (!fs.existsSync(logsDir)) {
    return [];
  }

  const entries = fs.readdirSync(logsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
    .map((entry) => entry.name)
    .sort();
}

function selectFiles(allFiles, requestedFiles) {
  if (!requestedFiles || requestedFiles.length === 0) {
    return { selected: allFiles, missing: [] };
  }

  const wanted = new Set(requestedFiles);
  const selected = allFiles.filter((name) => wanted.has(name));
  const existing = new Set(selected);
  const missing = [...wanted].filter((name) => !existing.has(name));
  return { selected, missing };
}

function scanFile(fileName, cutoffMs) {
  const fullPath = path.join(logsDir, fileName);
  const stats = fs.statSync(fullPath);

  if (stats.mtimeMs < cutoffMs) {
    return {
      file: fileName,
      scanned: false,
      reason: "stale",
      totals: { critical: 0, high: 0, medium: 0 },
      signatures: [],
    };
  }

  const content = fs.readFileSync(fullPath, "utf8");
  const lines = content.split(/\r?\n/);

  const countsBySeverity = {
    critical: 0,
    high: 0,
    medium: 0,
  };

  const signatureMap = new Map();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const severity = classify(line);
    if (!severity) {
      continue;
    }

    countsBySeverity[severity] += 1;
    const signature = sanitizeSignature(line);
    const key = `${severity}::${signature}`;
    const existing = signatureMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      signatureMap.set(key, {
        severity,
        signature,
        count: 1,
        sample: line.slice(0, 220),
      });
    }
  }

  const signatures = [...signatureMap.values()].sort((a, b) => {
    const severityDiff =
      severities.indexOf(a.severity) - severities.indexOf(b.severity);
    if (severityDiff !== 0) {
      return severityDiff;
    }
    return b.count - a.count;
  });

  return {
    file: fileName,
    scanned: true,
    reason: null,
    totals: countsBySeverity,
    signatures,
  };
}

function renderText(results, sinceMinutes) {
  const lines = [];
  lines.push(
    `Scanned ${results.length} file(s) from .logs (since ${sinceMinutes}m)`,
  );

  for (const result of results) {
    const totalMatches =
      result.totals.critical + result.totals.high + result.totals.medium;
    const base = `${result.file}: critical=${result.totals.critical} high=${result.totals.high} medium=${result.totals.medium}`;

    if (!result.scanned) {
      lines.push(`${base} (skipped: ${result.reason})`);
      continue;
    }

    lines.push(base);

    const sampleSignatures = result.signatures.slice(0, 3);
    for (const entry of sampleSignatures) {
      lines.push(`  - [${entry.severity}] x${entry.count} ${entry.sample}`);
    }

    if (totalMatches === 0) {
      lines.push("  - no matching signatures");
    }
  }

  return lines.join("\n");
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    usage();
    process.exit(1);
  }

  const availableFiles = ensureLogsDirExists();
  const { selected: selectedFiles, missing: missingFiles } = selectFiles(
    availableFiles,
    options.files,
  );

  const cutoffMs = Date.now() - options.sinceMinutes * 60 * 1000;
  const results = selectedFiles.map((fileName) => scanFile(fileName, cutoffMs));
  for (const missingFile of missingFiles) {
    results.push({
      file: missingFile,
      scanned: false,
      reason: "missing",
      totals: { critical: 0, high: 0, medium: 0 },
      signatures: [],
    });
  }

  const totals = results.reduce(
    (acc, result) => {
      acc.critical += result.totals.critical;
      acc.high += result.totals.high;
      acc.medium += result.totals.medium;
      return acc;
    },
    { critical: 0, high: 0, medium: 0 },
  );

  if (options.json) {
    const payload = {
      generatedAt: new Date().toISOString(),
      sinceMinutes: options.sinceMinutes,
      scannedFiles: selectedFiles,
      missingFiles,
      totals,
      results,
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  } else {
    process.stdout.write(`${renderText(results, options.sinceMinutes)}\n`);
  }

  if (options.failOnHigh && (totals.critical > 0 || totals.high > 0)) {
    process.exit(1);
  }
}

main();
