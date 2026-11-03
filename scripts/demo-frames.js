#!/usr/bin/env node
// Writes the README demo as one HTML file per frame, drawn by the plugin's real screens
// with made-up pull requests. Usage: node scripts/demo-frames.js <output-dir>
// Each file is named NN-<milliseconds>.html, so the duration travels with the frame.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyFixState } from '../src/autofix.js';
import { classify } from '../src/classify.js';
import { parseConfig, settingsFor } from '../src/config.js';
import { parseDiff } from '../src/diff.js';
import { THEME } from '../src/ui/cells.js';
import { renderBoard, renderDetail, renderMerge } from '../src/ui/views.js';

const W = 124;
const H = 25;
const NOW = 2_000_000_000_000;
const settings = settingsFor(parseConfig(''), 'acme/shop');

const passed = (name) => ({ name, status: 'COMPLETED', conclusion: 'SUCCESS' });
const failed = (name) => ({ name, status: 'COMPLETED', conclusion: 'FAILURE' });
const running = (name) => ({ name, status: 'IN_PROGRESS', conclusion: '' });
const BODY = 'Percent coupons were off by one. Round once at the end, and reject negative values.\n\n## Test plan\n- [ ] Fixed coupon applies the exact amount\n- [ ] Percent coupon rounds correctly';
const SHA = 'a3f91c2e77d04b18';

function card({ number, repo, title, checks = [], status = 'idle', activity = '', threads = [], fix = {}, headSeenAt = 0, prOver = {}, expectsAi = false, agent = true, autoFix = true }) {
  const pr = { number, title, body: BODY, state: 'OPEN', isDraft: false, author: { login: 'you' }, headRefName: 'fix/coupon-rounding', headRefOid: SHA, baseRefName: 'main', statusCheckRollup: checks, latestReviews: [], reviewRequests: [], mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', reviewDecision: '', changedFiles: 2, ...prOver };
  const merged = { ...emptyFixState(), ...fix };
  const liveAgent = agent ? { pane_id: 'p1', agent: 'claude', agent_status: status } : null;
  const result = classify(pr, { now: NOW, headSeenAt, threads, agent: liveAgent, activity, autoFix, autoStopped: merged.stopped, fix: merged, expectsAi }, settings);
  return { key: `#${number}`, url: `u${number}`, entry: { fix: merged, checked: {}, cwd: '/w' }, data: { pr, threads, comments: [], repoInfo: { methods: ['squash', 'merge'] } }, result, column: result.column, tone: result.tone, headline: result.headline, number, repo, agent: liveAgent };
}

const noPr = { key: 'docs', noPr: true, column: 'agent', tone: 'dim', headline: 'writing the auth section', repo: 'acme/docs', branch: 'feat/api-guide', agent: { agent: 'claude', agent_status: 'working' } };
const landing = (over = {}) => card({ number: 205, repo: 'acme/landing', title: 'Add pricing section', checks: [passed('build'), running('e2e')], headSeenAt: NOW, status: 'idle', ...over });
const blog = card({ number: 91, repo: 'acme/blog', title: 'Fix the broken RSS link', agent: false });
const SHOP = { number: 482, repo: 'acme/shop', title: 'Fix coupon rounding' };
const CHECKS = ['build', 'lint', 'unit', 'e2e'].map(passed);
const REVIEW = { latestReviews: [{ author: { login: 'coderabbitai' } }] };

const DIFF = parseDiff(`diff --git a/src/coupon.go b/src/coupon.go
@@ -38,7 +38,10 @@ package coupon

-func applyCoupon(price, percent int) int {
-	return price - price*percent/100
+func applyCoupon(price, percent int) (int, error) {
+	if percent < 0 {
+		return 0, ErrNegativePercent
+	}
+	total := float64(price) * (100 - float64(percent)) / 100
+	return int(math.Round(total)), nil
 }
diff --git a/src/coupon_test.go b/src/coupon_test.go
@@ -1,1 +1,2 @@
 package coupon
+// tests for rounding
`);

const status = { lastError: '', canAct: true, autoFix: true, dryRun: false, lastSync: NOW - 4000 };
const board = (cards, selectedKey, caption, ms, message = '') => ({ caption, ms, rows: renderBoard({ cards, selectedKey, status, now: NOW, message }, W, H) });
const detailModel = (c, tab, over = {}) => ({ cards: [c], card: c, status, now: NOW, tab, scroll: 0, fileIndex: 0, files: DIFF, threadIndex: 0, ciLog: '', message: '', ...over });

const ready = card({ ...SHOP, checks: CHECKS, prOver: REVIEW, fix: { attempts: 2 } });
const stuck = card({ number: 317, repo: 'acme/admin', title: 'Add bulk export', checks: [passed('build'), failed('export-test')], fix: { attempts: 3, stopped: 'same CI failure x3' } });
const merged = card({ ...SHOP, checks: CHECKS, prOver: { ...REVIEW, state: 'MERGED' }, fix: { attempts: 2 } });

const FRAMES = [
  board([noPr, card({ ...SHOP, checks: [passed('build'), running('unit')], headSeenAt: NOW }), landing(), blog], '#482', 'Your agent opens a PR. It appears on the board on its own.', 2800),
  board([noPr, card({ ...SHOP, checks: [passed('build'), failed('unit')], fix: { attempts: 1, lastSentAt: NOW, sentCi: { [`${SHA}:unit`]: true } } }), landing(), blog], '#482', 'CI fails. The failed log goes straight to the agent that opened the PR.', 3000),
  board([noPr, card({ ...SHOP, checks: [passed('build'), failed('unit')], status: 'working', activity: 'fixing rounding in coupon.go', fix: { attempts: 1 } }), landing(), blog], '#482', 'The agent fixes it and pushes. You keep working on something else.', 2600),
  board([noPr, card({ ...SHOP, checks: CHECKS, status: 'working', activity: 'adding a negative percent guard', threads: [{ id: 't', isResolved: false, isOutdated: false, path: 'src/coupon.go', line: 41, comments: [{ author: { login: 'coderabbitai' }, body: 'Negative percent is not handled.' }] }], fix: { attempts: 2 } }), landing(), blog], '#482', 'AI review comments go to the agent too, marked as untrusted input.', 2800),
  board([noPr, ready, stuck, landing(), blog], '#482', 'You only get called when a decision is yours. Repos with no CI say so.', 3600),
  { caption: 'Open a PR to read its description, checks and review threads here.', ms: 2800, rows: renderDetail(detailModel(ready, 'overview'), W, H) },
  { caption: 'Read the diff, run it locally, or ask the agent to verify. No GitHub tab.', ms: 3000, rows: renderDetail(detailModel(ready, 'diff'), W, H) },
  { caption: 'Merge from the terminal. The commit you checked is pinned, so a new push cancels it.', ms: 3400, rows: renderMerge(detailModel(ready, 'overview', { merge: { methods: ['squash', 'merge'], method: 'squash', sha: SHA } }), W, H) },
  board([noPr, merged, stuck, landing(), blog], '#317', 'Merged. Next up: the PR where the agent got stuck.', 3400),
];

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function segmentHtml(seg) {
  const styles = [];
  for (const name of seg.c.split(/\s+/).filter(Boolean)) {
    if (name === 'B') styles.push('font-weight:700');
    if (THEME.fg[name]) styles.push(`color:${THEME.fg[name]}`);
    if (THEME.bg[name]) styles.push(`background:${THEME.bg[name]}`);
  }
  return styles.length ? `<span style="${styles.join(';')}">${escapeHtml(seg.t)}</span>` : escapeHtml(seg.t);
}

function page(frame) {
  const lines = frame.rows.map((row) => `<span class="l">${row.map(segmentHtml).join('')}</span>`).join('');
  return `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap">
<style>
html,body{margin:0;background:#141517}
#shot{display:inline-block;padding:14px 16px 0}
pre{margin:0;font:400 14px/1.28 "JetBrains Mono",Menlo,monospace;color:${THEME.fg.f0};background:${THEME.bg.bg0};white-space:pre;font-variant-ligatures:none;padding:6px 8px}
.l{display:block}
.cap{font:500 16px/1 "JetBrains Mono",Menlo,monospace;color:#e6e8ec;padding:14px 2px 16px}
</style>
<div id="shot"><pre>${lines}</pre><div class="cap">${escapeHtml(frame.caption)}</div></div>`;
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
