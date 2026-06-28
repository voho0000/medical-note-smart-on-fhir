#!/usr/bin/env node
// Loop progress journal — how the agent reports what it's doing during a loop.
//
// Each call appends one event to .loop/journal.jsonl. The dashboard
// (scripts/loop/dashboard.mjs) merges this with the gate's verdict history into
// one live timeline so a watcher can see: goal, what's done, what's in progress,
// and the latest result.
//
// Usage:
//   node scripts/loop/log.mjs goal  "make eGFR aliases merge into one series"
//   node scripts/loop/log.mjs start "editing fhir-tools.ts"
//   node scripts/loop/log.mjs done  "editing fhir-tools.ts"
//   node scripts/loop/log.mjs note  "LOINC 33914-3 is the canonical code"
//   node scripts/loop/log.mjs stop  "gate passed"
//
// `start` opens an in-progress step; the matching `done` (same text) closes it.

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const journalPath = join(repoRoot, '.loop', 'journal.jsonl');

const KINDS = new Set(['goal', 'start', 'done', 'note', 'stop']);

const [, , kind, ...rest] = process.argv;
const text = rest.join(' ').trim();

if (!kind || !KINDS.has(kind)) {
  console.error(`Usage: node scripts/loop/log.mjs <${[...KINDS].join('|')}> "<text>"`);
  process.exit(2);
}
if (kind !== 'stop' && !text) {
  console.error(`"${kind}" needs text, e.g.  node scripts/loop/log.mjs ${kind} "what you're doing"`);
  process.exit(2);
}

const event = { ts: new Date().toISOString(), kind, text: text || null };

mkdirSync(dirname(journalPath), { recursive: true });
appendFileSync(journalPath, JSON.stringify(event) + '\n');

const icon = { goal: '🎯', start: '▶', done: '✓', note: '·', stop: '⏹' }[kind];
console.error(`${icon} ${kind}${text ? ': ' + text : ''}`);
