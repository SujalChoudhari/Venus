import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const coverageRoot = resolve(process.cwd(), "coverage");
const lcovCandidates = [
  resolve(coverageRoot, "lcov.info"),
  resolve(coverageRoot, "theme", "lcov.info"),
  resolve(coverageRoot, "prompts", "lcov.info"),
  resolve(coverageRoot, "embeddings", "lcov.info"),
  resolve(coverageRoot, "database", "lcov.info"),
  resolve(coverageRoot, "memory-index", "lcov.info"),
  resolve(coverageRoot, "manager", "lcov.info"),
  resolve(coverageRoot, "operations", "lcov.info"),
  resolve(coverageRoot, "registry", "lcov.info"),
  resolve(coverageRoot, "notes", "lcov.info"),
  resolve(coverageRoot, "chat-service", "lcov.info"),
].filter((path) => existsSync(path));

if (lcovCandidates.length === 0) {
  console.error("Coverage gate failed: no LCOV files found.");
  process.exit(1);
}

const includeFile = (filePath) => {
  const normalized = filePath.replaceAll("\\", "/");
  if (!normalized.includes("/src/")) return false;
  if (!normalized.includes("/src/core/") && !normalized.includes("/src/types/")) return false;
  if (normalized.includes("/src/core/hooks/")) return false;
  return true;
};

const files = new Map();

for (const lcovPath of lcovCandidates) {
  const raw = readFileSync(lcovPath, "utf8");
  const blocks = raw.split("end_of_record");

  for (const block of blocks) {
    const lines = block.trim().split("\n").filter(Boolean);
    if (lines.length === 0) continue;

    const sfLine = lines.find((line) => line.startsWith("SF:"));
    if (!sfLine) continue;
    const filePath = sfLine.slice(3).trim();
    if (!includeFile(filePath)) continue;

    let metrics = files.get(filePath);
    if (!metrics) {
      metrics = {
        lineHits: new Map(),
        funcHits: new Map(),
        branchHits: new Map(),
      };
      files.set(filePath, metrics);
    }

    for (const line of lines) {
      if (line.startsWith("DA:")) {
        const [, payload] = line.split(":");
        const [lineNo, hitsRaw] = payload.split(",");
        const hits = Number(hitsRaw);
        const prev = metrics.lineHits.get(lineNo) ?? 0;
        metrics.lineHits.set(lineNo, Math.max(prev, hits));
      } else if (line.startsWith("FNDA:")) {
        const [, payload] = line.split(":");
        const [hitsRaw, fnName] = payload.split(",");
        const hits = Number(hitsRaw);
        const prev = metrics.funcHits.get(fnName) ?? 0;
        metrics.funcHits.set(fnName, Math.max(prev, hits));
      } else if (line.startsWith("BRDA:")) {
        const [, payload] = line.split(":");
        const [ln, blockNo, branchNo, takenRaw] = payload.split(",");
        const key = `${ln}:${blockNo}:${branchNo}`;
        const taken = takenRaw === "-" ? 0 : Number(takenRaw);
        const prev = metrics.branchHits.get(key) ?? 0;
        metrics.branchHits.set(key, Math.max(prev, taken));
      }
    }
  }
}

const totals = {
  linesHit: 0,
  linesFound: 0,
  funcsHit: 0,
  funcsFound: 0,
  branchesHit: 0,
  branchesFound: 0,
};

for (const metrics of files.values()) {
  for (const hits of metrics.lineHits.values()) {
    totals.linesFound += 1;
    if (hits > 0) totals.linesHit += 1;
  }
  for (const hits of metrics.funcHits.values()) {
    totals.funcsFound += 1;
    if (hits > 0) totals.funcsHit += 1;
  }
  for (const hits of metrics.branchHits.values()) {
    totals.branchesFound += 1;
    if (hits > 0) totals.branchesHit += 1;
  }
}

const pct = (hit, found) => (found === 0 ? 100 : (hit / found) * 100);
const linesPct = pct(totals.linesHit, totals.linesFound);
const funcsPct = pct(totals.funcsHit, totals.funcsFound);
const branchesPct = pct(totals.branchesHit, totals.branchesFound);
const statementsPct = linesPct;

const failReasons = [];
if (linesPct < 100) failReasons.push(`lines=${linesPct.toFixed(2)}%`);
if (funcsPct < 100) failReasons.push(`functions=${funcsPct.toFixed(2)}%`);
if (branchesPct < 100) failReasons.push(`branches=${branchesPct.toFixed(2)}%`);
if (statementsPct < 100) failReasons.push(`statements=${statementsPct.toFixed(2)}%`);

if (failReasons.length > 0) {
  console.error(
    `Coverage gate failed for non-UI files: ${failReasons.join(", ")}.`,
  );
  process.exit(1);
}

console.log(
  `Coverage gate passed (non-UI): lines=${linesPct.toFixed(2)}%, functions=${funcsPct.toFixed(2)}%, branches=${branchesPct.toFixed(2)}%, statements=${statementsPct.toFixed(2)}%.`,
);
