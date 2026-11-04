#!/usr/bin/env node
// Writes the README demo as one HTML file per frame, drawn by the plugin's real screens
// with made-up pull requests. Usage: node scripts/demo-frames.js <output-dir>
// Each file is named NN-<milliseconds>.html, so the duration travels with the frame.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { settingsFrom } from '../src/config.js';
import { parseDiff } from '../src/diff.js';
import { prState } from '../src/status.js';
import { THEME, fit, s } from '../src/ui/cells.js';
import { renderDetail, renderDiff, renderList, renderLog } from '../src/ui/views.js';

const PANEL = 46;
const AGENT = 60;
const H = 25;
const NOW = 2_000_000_000_000;
const settings = settingsFrom({ lang: 'en' }, {});
const iso = (ms) => new Date(NOW - ms).toISOString();

const passed = (name, ago = 120000) => ({ name, status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: iso(ago) });
const failed = (name, ago = 60000) => ({ name, status: 'COMPLETED', conclusion: 'FAILURE', completedAt: iso(ago), detailsUrl: 'https://github.com/acme/admin/actions/runs/1/job/1' });
const running = (name) => ({ name, status: 'IN_PROGRESS', conclusion: '' });

function card(number, repo, title, over = {}, agent = { pane_id: 'p', agent: 'claude', agent_status: 'idle' }, threads = []) {
  const pr = { number, title, state: 'OPEN', headRefName: 'fix/coupon-rounding', baseRefName: 'main', statusCheckRollup: [], latestReviews: [], mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', reviewDecision: '', additions: 84, deletions: 12, createdAt: iso(1440000), files: [{ path: 'coupon.go', additions: 31, deletions: 8 }, { path: 'coupon_test.go', additions: 53, deletions: 4 }], ...over };
  const status = prState(pr, { now: NOW, headSeenAt: 0, threads }, settings);
  return { key: `k${number}`, url: 'u', repo: `acme/${repo}`, number, pr, status, agent, activity: '' };
}

const CHECKS = ['build', 'unit', 'e2e'].map((n) => passed(n));
const REVIEWED = { latestReviews: [{ author: { login: 'coderabbitai' } }] };
const codex = { pane_id: 'p', agent: 'codex', agent_status: 'idle' };
const others = () => [
  card(205, 'landing', 'Add a pricing section', { statusCheckRollup: [passed('build'), running('e2e')] }),
  card(91, 'blog', 'Fix the broken RSS link', { reviewDecision: 'REVIEW_REQUIRED' }, null),
];
const shop = (over, agent) => card(482, 'shop', 'Fix coupon rounding', over, agent);
const admin = card(317, 'admin', 'Add bulk export', { statusCheckRollup: [passed('build', 1300000), failed('export-test')], additions: 142, deletions: 9, files: [{ path: 'export.go', additions: 96, deletions: 4 }, { path: 'export_test.go', additions: 44, deletions: 5 }] }, codex);

const status = { lastError: '', lastSync: NOW - 4000 };
const base = { status, lang: 'en', now: NOW, scroll: 0, fileIndex: 0, message: '' };
const list = (cards, selectedKey) => renderList({ ...base, cards, selectedKey }, PANEL, H);

const DIFF = parseDiff(`diff --git a/export.go b/export.go
@@ -38,3 +38,6 @@ package export
 func rows(items []Item) int {
-	return len(items) - 1
+	if len(items) == 0 {
+		return 0
+	}
+	return len(items)
 }
`);
const LOG = `--- FAIL: TestExportCSV
  export_test.go:88:
  expected 120 rows
  got      119 rows
FAIL  admin/export  0.42s`;

const claudeWorking = ['> Fix the coupon rounding and open a PR', '', '* Fixed rounding in applyCoupon and added tests.', '', '* Opened PR #482.', '', '* Done.'];
const codexIdle = ['> Add bulk export and open a PR', '', '* Export works locally. Opened PR #317.', '', '* Done.', '', '> '];
const codexFixing = ['> export-test failed on CI. Find out why.', '', '* Reading the failed log...', '* The row count is off by one in rows().', '', '* Fixing it and adding a test.'];

const FRAMES = [
  { agent: claudeWorking, title: 'claude', rows: list([shop({ statusCheckRollup: [passed('build'), running('unit')] }), admin, ...others()], 'k482'), caption: 'Every PR your agents opened, and where each one is.', ms: 3200 },
  { agent: claudeWorking, title: 'claude', rows: list([shop({ statusCheckRollup: CHECKS, ...REVIEWED }), admin, ...others()], 'k482'), caption: 'CI and review update on their own. No GitHub tab.', ms: 2800 },
  { agent: codexIdle, title: 'codex', rows: list([shop({ statusCheckRollup: CHECKS, ...REVIEWED }), admin, ...others()], 'k317'), caption: 'A failed PR shows up as soon as it fails.', ms: 2600 },
  { agent: codexIdle, title: 'codex', rows: renderDetail({ ...base, card: admin }, PANEL, H), caption: 'Open it to see how far it got, and which agent has it.', ms: 3400 },
  { agent: codexIdle, title: 'codex', rows: renderLog({ ...base, card: admin, log: LOG, scroll: 0 }, PANEL, H), caption: 'Read the failed part of the log.', ms: 2800 },
  { agent: codexIdle, title: 'codex', rows: renderDiff({ ...base, card: admin, files: DIFF }, PANEL, H), caption: 'Read the changes.', ms: 2800 },
  { agent: codexFixing, title: 'codex', rows: renderDetail({ ...base, card: { ...admin, agent: { ...codex, agent_status: 'working' } } }, PANEL, H), caption: 'Press enter to jump to the agent, and tell it there.', ms: 3400, focusAgent: true },
];

function compose(frame) {
  const left = Array.from({ length: H }, (_, y) => {
    if (y === 0) return fit([s(` ${frame.title}`, frame.focusAgent ? 'cya B' : 'f1 B')], AGENT);
    const text = frame.agent[y - 2] ?? '';
    return fit([s(text ? ` ${text}` : '', text.startsWith('>') ? 'f0 B' : 'f1')], AGENT);
  });
  return frame.rows.map((row, y) => [...left[y], s('│', 'ln'), ...row]);
}

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function segmentData(seg) {
  const names = seg.c.split(/\s+/).filter(Boolean);
  const fg = names.map((n) => THEME.fg[n]).find(Boolean) ?? THEME.fg.f0;
  const bg = names.map((n) => THEME.bg[n]).find(Boolean) ?? THEME.bg.bg0;
  return [seg.t, fg, bg, names.includes('B')];
}

// Runs in the page. Draws on a fixed cell grid and draws box lines as shapes, the way a
// terminal does, so lines stay continuous and corners meet. All demo text is one cell wide.
function drawFrame(rows, cellW, cellH) {
  const canvas = document.getElementById('screen');
  const columns = rows[0].reduce((n, seg) => n + seg[0].length, 0);
  canvas.width = columns * cellW;
  canvas.height = rows.length * cellH;
  const ctx = canvas.getContext('2d', { alpha: false });
  const line = (x1, y1, x2, y2, color, weight) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.max(Math.abs(x2 - x1), weight), Math.max(Math.abs(y2 - y1), weight));
  };
  ctx.textBaseline = 'middle';
  rows.forEach((row, r) => {
    let c = 0;
    for (const [text, fg, bg, bold] of row) {
      for (const ch of text) {
        const x = c * cellW;
        const y = r * cellH;
        const midX = x + Math.floor(cellW / 2);
        const midY = y + Math.floor(cellH / 2);
        ctx.fillStyle = bg;
        ctx.fillRect(x, y, cellW, cellH);
        const px = midX + 0.5;
        const py = midY + 0.5;
        if (ch === '─') line(x, midY, x + cellW, midY, fg, 1);
        else if (ch === '━') line(x, midY - 1, x + cellW, midY - 1, fg, 2);
        else if (ch === '│') line(midX, y, midX, y + cellH, fg, 1);
        else if (ch === '╭') { ctx.strokeStyle = fg; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, y + cellH); ctx.lineTo(px, py + 4); ctx.quadraticCurveTo(px, py, px + 4, py); ctx.lineTo(x + cellW, py); ctx.stroke(); }
        else if (ch === '╮') { ctx.strokeStyle = fg; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(px - 4, py); ctx.quadraticCurveTo(px, py, px, py + 4); ctx.lineTo(px, y + cellH); ctx.stroke(); }
        else if (ch === '╰') { ctx.strokeStyle = fg; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, py - 4); ctx.quadraticCurveTo(px, py, px + 4, py); ctx.lineTo(x + cellW, py); ctx.stroke(); }
        else if (ch === '╯') { ctx.strokeStyle = fg; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(px - 4, py); ctx.quadraticCurveTo(px, py, px, py - 4); ctx.lineTo(px, y); ctx.stroke(); }
        else if (ch !== ' ') {
          ctx.fillStyle = fg;
          ctx.font = `${bold ? 700 : 400} 15px "JetBrains Mono", Menlo, monospace`;
          ctx.fillText(ch, x, y + cellH / 2 + 1);
        }
        c += 1;
      }
    }
  });
  document.body.dataset.ready = '1';
}

function page(frame) {
  const data = JSON.stringify(compose(frame).map((row) => row.map(segmentData))).replace(/</g, '\\u003c');
  return `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap">
<style>
html,body{margin:0;background:#141517}
#shot{display:inline-block;padding:14px 16px 0}
canvas{display:block}
.cap{font:500 16px/1 "JetBrains Mono",Menlo,monospace;color:#e6e8ec;padding:14px 2px 16px}
</style>
<div id="shot"><canvas id="screen"></canvas><div class="cap">${escapeHtml(frame.caption)}</div></div>
<script>
const drawFrame = ${drawFrame.toString()};
Promise.all([document.fonts.load('400 15px "JetBrains Mono"'), document.fonts.load('700 15px "JetBrains Mono"')]).then(() => drawFrame(${data}, 9, 19));
</script>`;
}

const dir = process.argv[2];
if (!dir) {
  process.stderr.write('Usage: node scripts/demo-frames.js <output-dir>\n');
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
FRAMES.forEach((frame, i) => {
  writeFileSync(join(dir, `${String(i).padStart(2, '0')}-${frame.ms}.html`), page(frame));
});
process.stdout.write(`${FRAMES.length} frames written to ${dir}\n`);
