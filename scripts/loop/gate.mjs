#!/usr/bin/env node
// Loop-engineering verifier gate (workstream A).
//
// Runs the project's quality gates as one chained verifier and emits a
// structured verdict the loop runner reads to decide: pass / retry / abort.
// See scripts/loop/README.md for the loop protocol and stop conditions.
//
// Usage:
//   node scripts/loop/gate.mjs                 # fast gates: typecheck, lint, test
//   node scripts/loop/gate.mjs --with-build    # also run the GH-Pages build (slow)
//   node scripts/loop/gate.mjs --checks=typecheck,test
//   node scripts/loop/gate.mjs --json          # print only the verdict JSON
//
// Optional external gate:
//   set LOOP_EXTERNAL_GATE_CMD to any command. It runs as one extra gate and
//   its exit code folds into the verdict (0 = pass). Name it via
//   LOOP_EXTERNAL_GATE_NAME (default "external"). This script only sees the
//   command's exit code and output tail — nothing about what it does.
//
// Exit code: 0 if every gate passed, 1 otherwise.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const verdictPath = join(repoRoot, '.loop', 'last-gate.json');
const historyPath = join(repoRoot, '.loop', 'history.jsonl');

const EXTERNAL_NAME = process.env.LOOP_EXTERNAL_GATE_NAME || 'external';
const EXTERNAL_CMD = process.env.LOOP_EXTERNAL_GATE_CMD || null;

// The built-in gates, in run order. `cmd` is argv (no shell) so nothing is
// injectable here. The external gate is added below only when configured.
const GATES = {
  typecheck: { cmd: ['npx', 'tsc', '--noEmit'] },
  lint: { cmd: ['npm', 'run', 'lint'] },
  test: { cmd: ['npm', 'test', '--', '--ci', '--passWithNoTests', '--testPathIgnorePatterns=worktrees'] },
  build: {
    cmd: ['npm', 'run', 'build:gh'],
    env: {
      GITHUB_PAGES: 'true',
      NEXT_PUBLIC_BASE_PATH: '/medical-note-smart-on-fhir',
      TAILWIND_DISABLE_LIGHTNINGCSS: 'true',
    },
  },
};

function parseArgs(argv) {
  const opts = { checks: null, withBuild: false, jsonOnly: false };
  for (const arg of argv) {
    if (arg === '--with-build') opts.withBuild = true;
    else if (arg === '--json') opts.jsonOnly = true;
    else if (arg.startsWith('--checks=')) {
      opts.checks = arg
        .slice('--checks='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return opts;
}

function selectGateNames(opts) {
  if (opts.checks) {
    const unknown = opts.checks.filter((c) => !(c in GATES) && c !== EXTERNAL_NAME);
    if (unknown.length) {
      console.error(`Unknown gate(s): ${unknown.join(', ')}. Known: ${Object.keys(GATES).join(', ')}, ${EXTERNAL_NAME}`);
      process.exit(2);
    }
    return opts.checks;
  }
  // Default: fast gates only. Build is slow, so opt-in per the loop's time budget.
  const names = ['typecheck', 'lint', 'test'];
  if (opts.withBuild) names.push('build');
  return names;
}

function runGate(name, gate) {
  const start = Date.now();
  return new Promise((resolve) => {
    let useShell = false;
    let spawnArgs;
    if (gate.cmd) {
      spawnArgs = [gate.cmd[0], gate.cmd.slice(1)];
    } else {
      // External gate: a user-supplied shell string from env. Runs with
      // shell:true by design — it is a trusted entrypoint set as config.
      useShell = true;
      spawnArgs = [gate.shellCmd, []];
    }
    const child = spawn(spawnArgs[0], spawnArgs[1], {
      cwd: repoRoot,
      shell: useShell,
      env: { ...process.env, ...(gate.env || {}) },
    });
    let out = '';
    const capture = (buf) => {
      out += buf.toString();
      if (out.length > 64_000) out = out.slice(-64_000); // keep tail, bound memory
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.on('error', (err) => {
      resolve({ name, ok: false, durationMs: Date.now() - start, summary: `spawn failed: ${err.message}` });
    });
    child.on('close', (code) => {
      const tail = out.split('\n').filter(Boolean).slice(-12).join('\n');
      resolve({
        name,
        ok: code === 0,
        exitCode: code,
        durationMs: Date.now() - start,
        summary: tail || `(no output) exit ${code}`,
      });
    });
  });
}

// A stable fingerprint of *what is failing*, so the loop runner can detect
// "no progress" (same failures two iterations running) and abort.
function failureSignature(results) {
  const failing = results.filter((r) => !r.ok).map((r) => `${r.name}:${r.summary}`).join('\n');
  if (!failing) return null;
  return createHash('sha256').update(failing).digest('hex').slice(0, 16);
}

async function runExternal(opts, results) {
  if (!EXTERNAL_CMD) {
    results.push({ name: EXTERNAL_NAME, ok: true, skipped: true, durationMs: 0, summary: 'LOOP_EXTERNAL_GATE_CMD not set — skipped' });
    if (!opts.jsonOnly) console.error(`· ${EXTERNAL_NAME}: skipped (LOOP_EXTERNAL_GATE_CMD not set)`);
    return;
  }
  if (!opts.jsonOnly) console.error(`▶ ${EXTERNAL_NAME} …`);
  const r = await runGate(EXTERNAL_NAME, { shellCmd: EXTERNAL_CMD });
  results.push(r);
  if (!opts.jsonOnly) console.error(`${r.ok ? '✓' : '✗'} ${EXTERNAL_NAME} (${r.durationMs}ms)`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const names = selectGateNames(opts);
  const results = [];

  for (const name of names) {
    if (name === EXTERNAL_NAME) {
      await runExternal(opts, results);
      continue;
    }
    if (!opts.jsonOnly) console.error(`▶ ${name} …`);
    const r = await runGate(name, GATES[name]);
    results.push(r);
    if (!opts.jsonOnly) console.error(`${r.ok ? '✓' : '✗'} ${name} (${r.durationMs}ms)`);
  }

  // Always run the external gate after the named ones, unless it was already
  // requested explicitly via --checks.
  if (EXTERNAL_CMD && !names.includes(EXTERNAL_NAME)) {
    await runExternal(opts, results);
  }

  const ok = results.every((r) => r.ok);
  const verdict = {
    ok,
    timestamp: new Date().toISOString(),
    gates: results,
    failureSignature: failureSignature(results),
  };

  mkdirSync(dirname(verdictPath), { recursive: true });
  writeFileSync(verdictPath, JSON.stringify(verdict, null, 2) + '\n');
  // Append one line per run so the dashboard (scripts/loop/dashboard.mjs) can
  // show history and spot no-progress streaks across iterations.
  appendFileSync(historyPath, JSON.stringify(verdict) + '\n');

  if (opts.jsonOnly) {
    process.stdout.write(JSON.stringify(verdict, null, 2) + '\n');
  } else {
    const failed = results.filter((r) => !r.ok).map((r) => r.name);
    console.error('');
    console.error(ok ? '✅ GATE PASS' : `❌ GATE FAIL — ${failed.join(', ')}`);
    console.error(`verdict → ${verdictPath}`);
  }

  process.exit(ok ? 0 : 1);
}

main();
