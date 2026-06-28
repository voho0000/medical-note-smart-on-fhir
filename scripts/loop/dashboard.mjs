#!/usr/bin/env node
// Loop-engineering monitoring console.
//
// A tiny zero-dependency local web page that shows, live, what the loop is
// doing: the current goal, what's done, what's in progress right now, and the
// latest gate result. It merges two streams the loop writes:
//   .loop/journal.jsonl  — progress events from scripts/loop/log.mjs
//   .loop/history.jsonl  — one gate verdict per run from scripts/loop/gate.mjs
//
// Usage:
//   node scripts/loop/dashboard.mjs            # http://localhost:4555
//   node scripts/loop/dashboard.mjs --port=5000
//
// Local dev tool only — never wired into the shipped app.

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const journalPath = join(repoRoot, '.loop', 'journal.jsonl');
const historyPath = join(repoRoot, '.loop', 'history.jsonl');

const portArg = process.argv.find((a) => a.startsWith('--port='));
const PORT = portArg ? Number(portArg.slice('--port='.length)) : 4555;

function readJsonl(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const out = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // skip a malformed line rather than break the whole view
    }
  }
  return out;
}

// Build the unified feed the page renders.
function buildFeed() {
  const journal = readJsonl(journalPath);
  const verdicts = readJsonl(historyPath);

  // Normalise both streams into one timeline of events with a common shape.
  const events = [];
  for (const e of journal) {
    events.push({ ts: e.ts, kind: e.kind, text: e.text });
  }
  for (const v of verdicts) {
    const failed = (v.gates || []).filter((g) => !g.ok && !g.skipped).map((g) => g.name);
    events.push({
      ts: v.timestamp,
      kind: 'gate',
      ok: v.ok,
      failed,
      failureSignature: v.failureSignature || null,
      gates: v.gates || [],
    });
  }
  events.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));

  // Derive the current goal: the most recent `goal` event.
  let goal = null;
  for (const e of events) if (e.kind === 'goal') goal = e.text;

  // Derive the in-progress step: the latest `start` not yet closed by a `done`
  // with the same text, and not after a `stop`.
  let current = null;
  const openByText = new Map();
  let stopped = null;
  for (const e of events) {
    if (e.kind === 'start') openByText.set(e.text, e);
    else if (e.kind === 'done') openByText.delete(e.text);
    else if (e.kind === 'stop') stopped = e.text || 'stopped';
    else if (e.kind === 'goal') stopped = null; // a new goal resumes the loop
  }
  const open = [...openByText.values()];
  if (open.length) current = open[open.length - 1].text;

  // The latest gate verdict, for the "result" panel.
  const lastGate = [...events].reverse().find((e) => e.kind === 'gate') || null;

  let status = 'idle';
  if (stopped) status = 'stopped';
  else if (current) status = 'running';
  else if (goal) status = 'waiting';

  return { goal, status, stopped, current, lastGate, events };
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Loop console</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
         background: #0e1116; color: #d6dae0; }
  header { padding: 14px 20px; border-bottom: 1px solid #222a35;
           display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
  h1 { font-size: 15px; margin: 0; font-weight: 600; letter-spacing: .3px; }
  .muted { color: #6b7684; }
  main { padding: 20px; max-width: 1000px; margin: 0 auto; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px; }
  @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
  .card { border: 1px solid #222a35; border-radius: 10px; padding: 16px; }
  .card h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .8px;
             color: #6b7684; margin: 0 0 10px; font-weight: 500; }
  .goal { font-size: 16px; font-weight: 600; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px;
           font-size: 12px; border: 1px solid currentColor; vertical-align: middle; }
  .running { color: #59b0ff; } .stopped { color: #f7b955; }
  .waiting { color: #8b94a1; } .idle { color: #6b7684; }
  .pass { color: #36d399; } .fail { color: #f8717f; } .skip { color: #8b94a1; }
  .now { font-size: 16px; display: flex; align-items: center; gap: 10px; }
  .blip { width: 10px; height: 10px; border-radius: 50%; background: #59b0ff;
          box-shadow: 0 0 0 0 rgba(89,176,255,.6); animation: pulse 1.4s infinite; }
  @keyframes pulse { to { box-shadow: 0 0 0 9px rgba(89,176,255,0); } }
  .verdict { font-size: 22px; font-weight: 700; }
  .warn { margin-top: 12px; padding: 10px 12px; border-radius: 8px;
          background: #2a1e12; color: #f7b955; border: 1px solid #5a4222; }
  .gates { display: grid; gap: 6px; margin-top: 12px; }
  .gate { display: flex; gap: 9px; align-items: center; font-size: 13px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
  h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .8px;
       color: #6b7684; margin: 24px 0 10px; }
  ul.feed { list-style: none; margin: 0; padding: 0; }
  ul.feed li { display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px solid #1a212b; }
  .ico { width: 18px; text-align: center; flex: none; }
  .when { color: #5a6472; font-size: 12px; white-space: nowrap; }
  .txt { flex: 1; }
  .empty { color: #6b7684; padding: 48px 0; text-align: center; }
</style>
</head>
<body>
<header>
  <h1>Loop console</h1>
  <span class="muted" id="status">connecting…</span>
</header>
<main id="root"><div class="empty">loading…</div></main>
<script>
const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString(); } catch { return iso; } };
const fmtDur = (ms) => ms == null ? '' : (ms < 1000 ? ms + 'ms' : (ms/1000).toFixed(1) + 's');
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const ICON = { goal: '🎯', start: '▶', done: '✓', note: '·', stop: '⏹', gate: '🧪' };

function gateLine(g) {
  const color = g.skipped ? '#8b94a1' : (g.ok ? '#36d399' : '#f8717f');
  const label = g.skipped ? 'SKIP' : (g.ok ? 'PASS' : 'FAIL');
  const cls = g.skipped ? 'skip' : (g.ok ? 'pass' : 'fail');
  return \`<div class="gate"><span class="dot" style="background:\${color}"></span>
    <span>\${esc(g.name)}</span><span class="\${cls}">\${label}</span>
    <span class="muted" style="margin-left:auto">\${fmtDur(g.durationMs)}</span></div>\`;
}

function feedRow(e) {
  let txt;
  if (e.kind === 'gate') {
    const cls = e.ok ? 'pass' : 'fail';
    const what = e.ok ? 'GATE PASS' : ('GATE FAIL — ' + esc((e.failed||[]).join(', ')));
    txt = \`<span class="\${cls}">\${what}</span>\`;
  } else {
    txt = esc(e.text || e.kind);
  }
  return \`<li><span class="ico">\${ICON[e.kind] || '·'}</span>
    <span class="txt">\${txt}</span><span class="when">\${fmtTime(e.ts)}</span></li>\`;
}

function render(d) {
  const root = document.getElementById('root');
  if (!d.events.length) {
    root.innerHTML = '<div class="empty">No loop activity yet.<br>Log progress with '
      + '<b>node scripts/loop/log.mjs goal "…"</b> and run <b>npm run loop:gate</b>.</div>';
    return;
  }
  const g = d.lastGate;
  const stuck = g && g.failureSignature &&
    d.events.filter(e => e.kind==='gate').slice(-2).every(e => e.failureSignature === g.failureSignature) &&
    d.events.filter(e => e.kind==='gate').length >= 2;

  const statusCls = d.status;
  const nowHtml = d.status === 'running'
    ? \`<div class="now"><span class="blip"></span><span>\${esc(d.current)}</span></div>\`
    : d.status === 'stopped'
      ? \`<div class="now"><span>⏹ \${esc(d.stopped)}</span></div>\`
      : \`<div class="now muted">idle — waiting for the next step</div>\`;

  const resultHtml = g
    ? \`<div class="verdict \${g.ok ? 'pass' : 'fail'}">\${g.ok ? '✅ PASS' : '❌ FAIL'}</div>
       <div class="muted">\${fmtTime(g.ts)}</div>
       \${stuck ? '<div class="warn">⚠ No progress — same failure repeated. Loop should stop and ask a human.</div>' : ''}
       <div class="gates">\${(g.gates||[]).map(gateLine).join('')}</div>\`
    : '<div class="muted">No gate run yet.</div>';

  const feedHtml = [...d.events].reverse().slice(0, 60).map(feedRow).join('');

  root.innerHTML = \`
    <div class="grid">
      <div class="card">
        <h2>Goal · <span class="badge \${statusCls}">\${d.status}</span></h2>
        <div class="goal">\${d.goal ? esc(d.goal) : '<span class="muted">no goal set</span>'}</div>
        <h2 style="margin-top:16px">Now doing</h2>
        \${nowHtml}
      </div>
      <div class="card">
        <h2>Latest result</h2>
        \${resultHtml}
      </div>
    </div>
    <h3>Activity · newest first</h3>
    <ul class="feed">\${feedHtml}</ul>\`;
}

async function tick() {
  try {
    const res = await fetch('/api/feed');
    const d = await res.json();
    render(d);
    document.getElementById('status').textContent =
      'live · refreshed ' + new Date().toLocaleTimeString();
  } catch {
    document.getElementById('status').textContent = 'disconnected — is the dashboard server still running?';
  }
}
tick();
setInterval(tick, 2500);
</script>
</body>
</html>`;

const server = createServer((req, res) => {
  if (req.url === '/api/feed') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(buildFeed()));
    return;
  }
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.error(`Loop console → http://localhost:${PORT}`);
  console.error('Log progress: node scripts/loop/log.mjs goal|start|done|note|stop "…"');
  console.error('Run gates:    npm run loop:gate   (page updates live)');
});
