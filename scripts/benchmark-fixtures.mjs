#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, '..');
const manifestPath = path.join(repoRoot, 'fixtures', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

function parseArgs(argv) {
  const options = {
    all: false,
    includeGenerated: false,
    iterations: 3,
    fixtureIds: [],
  };

  for (const arg of argv) {
    if (arg === '--all') {
      options.all = true;
    } else if (arg === '--include-generated') {
      options.includeGenerated = true;
    } else if (arg.startsWith('--iterations=')) {
      options.iterations = Number(arg.slice('--iterations='.length));
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: ./scripts/benchmark-fixtures.sh [fixture-id ...] [--all] [--include-generated] [--iterations=N]

Defaults to fixtures with benchmarkDefault=true in fixtures/manifest.json.
Use --include-generated to include generated fixtures that already exist on disk.
`);
      process.exit(0);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.fixtureIds.push(arg);
    }
  }

  if (!Number.isFinite(options.iterations) || options.iterations <= 0) {
    throw new Error(`Invalid iteration count: ${options.iterations}`);
  }

  return options;
}

function avg(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pad(value, width) {
  return String(value).padEnd(width, ' ');
}

function findFile(rootDir, fileName) {
  const entries = readdirSync(rootDir);
  for (const entry of entries) {
    const absolute = path.join(rootDir, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      const nested = findFile(absolute, fileName);
      if (nested) return nested;
      continue;
    }
    if (entry === fileName) return absolute;
  }
  return null;
}

function compileGraphLayoutModule() {
  const tscPath = path.join(repoRoot, 'ui', 'node_modules', '.bin', 'tsc');
  if (!existsSync(tscPath)) {
    throw new Error('Missing ui/node_modules/.bin/tsc. Run `npm --prefix ui install` first.');
  }

  const outDir = mkdtempSync(path.join(tmpdir(), 'buildscope-fixture-bench-'));
  execFileSync(
    tscPath,
    [
      'src/graphLayout.ts',
      '--outDir', outDir,
      '--module', 'commonjs',
      '--target', 'es2020',
      '--moduleResolution', 'node',
      '--skipLibCheck',
    ],
    {
      cwd: path.join(repoRoot, 'ui'),
      stdio: 'inherit',
    }
  );

  const compiledPath = findFile(outDir, 'graphLayout.js');
  if (!compiledPath) {
    throw new Error(`Could not find compiled graphLayout.js under ${outDir}`);
  }

  return { outDir, module: require(compiledPath) };
}

function resolveFixtures(options) {
  const fixtureById = new Map(manifest.fixtures.map((fixture) => [fixture.id, fixture]));
  const selected = options.fixtureIds.length > 0
    ? options.fixtureIds.map((fixtureId) => {
        const fixture = fixtureById.get(fixtureId);
        if (!fixture) throw new Error(`Unknown fixture id: ${fixtureId}`);
        return fixture;
      })
    : manifest.fixtures.filter(
        (fixture) => options.all || fixture.benchmarkDefault || (options.includeGenerated && !fixture.checkedIn)
      );

  return selected.filter((fixture) => options.includeGenerated || fixture.checkedIn);
}

const options = parseArgs(process.argv.slice(2));
const selectedFixtures = resolveFixtures(options);
const runnableFixtures = [];
const skippedFixtures = [];

for (const fixture of selectedFixtures) {
  const absolutePath = path.join(repoRoot, fixture.path);
  if (!existsSync(absolutePath)) {
    skippedFixtures.push({
      id: fixture.id,
      path: fixture.path,
      reason: 'file missing',
    });
    continue;
  }
  runnableFixtures.push({
    ...fixture,
    absolutePath,
  });
}

if (runnableFixtures.length === 0) {
  console.error('No fixture files are available to benchmark.');
  process.exit(1);
}

const { outDir, module } = compileGraphLayoutModule();
const { sanitizeGraph, layeredLayout } = module;

console.log(`Benchmarking ${runnableFixtures.length} fixture(s) with ${options.iterations} iteration(s) each`);
console.log('');
console.log(
  `${pad('Fixture', 42)}${pad('Raw', 12)}${pad('Clean', 12)}${pad('Hotspots', 10)}${pad('Largest', 10)}${pad('Sanitize', 12)}${pad('Layout', 12)}`
);
console.log('-'.repeat(110));

try {
  for (const fixture of runnableFixtures) {
    const raw = JSON.parse(readFileSync(fixture.absolutePath, 'utf8'));
    const sanitizeSamples = [];
    const layoutSamples = [];
    let cleaned = null;
    let positioned = null;

    for (let iteration = 0; iteration < options.iterations; iteration++) {
      const start = performance.now();
      cleaned = sanitizeGraph(raw);
      const afterSanitize = performance.now();

      const originalConsoleLog = console.log;
      console.log = () => {};
      try {
        positioned = layeredLayout(cleaned);
      } finally {
        console.log = originalConsoleLog;
      }

      const afterLayout = performance.now();
      sanitizeSamples.push(afterSanitize - start);
      layoutSamples.push(afterLayout - afterSanitize);
    }

    const rawLabel = `${raw.nodes.length}/${raw.edges.length}`;
    const cleanLabel = `${cleaned.nodes.length}/${cleaned.edges.length}`;

    console.log(
      `${pad(fixture.id, 42)}${pad(rawLabel, 12)}${pad(cleanLabel, 12)}${pad(positioned.hotspotCount, 10)}${pad(positioned.largestHotspotSize, 10)}${pad(`${avg(sanitizeSamples).toFixed(2)} ms`, 12)}${pad(`${avg(layoutSamples).toFixed(2)} ms`, 12)}`
    );
  }

  if (skippedFixtures.length > 0) {
    console.log('');
    console.log('Skipped fixtures:');
    for (const skipped of skippedFixtures) {
      console.log(`- ${skipped.id}: ${skipped.reason} (${skipped.path})`);
    }
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
