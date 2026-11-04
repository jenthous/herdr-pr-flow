import test from 'node:test';
import assert from 'node:assert/strict';
import { settingsFrom } from '../src/config.js';
import { parseDiff } from '../src/diff.js';
import { prState } from '../src/status.js';
import { width } from '../src/text.js';
import { toPlain } from '../src/ui/cells.js';
import { renderDetail, renderDiff, renderList, renderLog } from '../src/ui/views.js';

const settings = settingsFrom({}, {});
const NOW = 1_000_000_000;
const iso = (ms) => new Date(NOW - ms).toISOString();

function card(over = {}, threads = []) {
  const pr = {
    number: 482, title: '쿠폰 할인 금액 반올림 오류 수정 — 아주 긴 제목이 들어와도 칸을 넘으면 안 됩니다', state: 'OPEN', headRefName: 'fix/쿠폰-아주-긴-브랜치-이름입니다', headRefOid: 'a3f91c2', baseRefName: 'main',
    statusCheckRollup: [{ name: '아주 긴 이름의 실패한 체크입니다 정말로 깁니다', status: 'COMPLETED', conclusion: 'FAILURE', completedAt: iso(180000), detailsUrl: 'https://github.com/a/b/actions/runs/9/job/1' }, { name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: iso(240000) }],
    latestReviews: [], mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', reviewDecision: '', additions: 84, deletions: 12, files: [{ path: 'src/아주/긴/경로/파일이름이/정말로/깁니다/coupon.go', additions: 31, deletions: 8 }], createdAt: iso(1440000), ...over,
  };
  const status = prState(pr, { now: NOW, headSeenAt: 0, threads }, settings);
  return { key: `k${pr.number}`, url: 'u', repo: 'acme/쇼핑몰', number: pr.number, pr, status, agent: { pane_id: 'p', agent: 'claude', agent_status: 'working' }, activity: '테스트를 추가하는 중입니다 '.repeat(5) };
}

const status = { lastError: '', lastSync: NOW - 12000 };
const SIZES = [[120, 40], [60, 30], [44, 30], [36, 24], [28, 16], [20, 10]];
const files = parseDiff(`diff --git a/a.go b/a.go\n@@ -1,2 +1,3 @@\n keep\n+새 줄 ${'가'.repeat(200)}\n-old\n`);

function exact(rows, W, H, label) {
  assert.equal(rows.length, H, `${label} height`);
  rows.forEach((row, y) => assert.equal(width(toPlain(row)), W, `${label} ${W}x${H} row ${y}: ${toPlain(row)}`));
}

for (const lang of ['ko', 'en']) {
  test(`every screen is exactly the pane width with Korean text (${lang})`, () => {
    const c = card();
    const many = Array.from({ length: 12 }, (_, i) => card({ number: 100 + i }));
    const loading = { key: 'l', repo: 'acme/x', number: 9, loading: true };
    const failed = { key: 'e', repo: 'acme/y', number: 8, loading: true, error: '오류입니다 '.repeat(30) };
    for (const [W, H] of SIZES) {
      const base = { cards: [c, ...many, loading, failed], selectedKey: 'k111', card: c, status, lang, now: NOW, scroll: 2, fileIndex: 0, message: '' };
      exact(renderList(base, W, H), W, H, 'list');
      exact(renderList({ ...base, cards: [], message: '' }, W, H), W, H, 'empty');
      exact(renderList({ ...base, status: { lastError: 'gh: 긴 오류 '.repeat(20), lastSync: 0 } }, W, H), W, H, 'error');
      exact(renderList({ ...base, message: '메시지 '.repeat(40) }, W, H), W, H, 'message');
      exact(renderDetail(base, W, H), W, H, 'detail');
      exact(renderDiff({ ...base, files }, W, H), W, H, 'diff');
      exact(renderDiff({ ...base, files: null }, W, H), W, H, 'diff loading');
      exact(renderDiff({ ...base, files: [] }, W, H), W, H, 'diff none');
      exact(renderLog({ ...base, log: '로그 '.repeat(300) }, W, H), W, H, 'log');
      exact(renderLog({ ...base, log: null }, W, H), W, H, 'log loading');
    }
  });
}

const list = (c, lang = 'ko') => renderList({ cards: [c], selectedKey: c.key, status, lang, now: NOW, message: '' }, 60, 12).map(toPlain).join('\n');

test('the row shows finished steps and the current fact without advice', () => {
  assert.match(list(card()), /CI 실패/);
  assert.match(list(card({ statusCheckRollup: [{ name: 'b', status: 'COMPLETED', conclusion: 'SUCCESS' }], latestReviews: [{ author: { login: 'x' } }] })), /CI ✓ · 리뷰 ✓ → 머지 가능/);
  assert.match(list(card({ statusCheckRollup: [] })), /CI 없음 → 머지 가능/);
  assert.match(list(card({ state: 'MERGED', statusCheckRollup: [] }), 'en'), /no CI → merged/);
});

test('a state with no finished step has no stray arrow', () => {
  const text = list(card({ statusCheckRollup: [{ name: 'b', status: 'IN_PROGRESS' }] }));
  assert.match(text, /CI 실행 중/);
  assert.equal(text.includes('→'), false);
});

test('the empty list explains where PRs come from', () => {
  const text = renderList({ cards: [], selectedKey: null, status, lang: 'en', now: NOW, message: '' }, 60, 12).map(toPlain).join('\n');
  assert.match(text, /No PRs yet/);
  assert.match(text, /appear here on their own/);
});

test('details show progress, agent and files, and the log key only when a check failed', () => {
  const base = { status, lang: 'en', now: NOW, scroll: 0, message: '' };
  const c = card();
  const text = renderDetail({ ...base, card: c }, 80, 30).map(toPlain).join('\n');
  assert.match(text, /PR opened\s+24m ago/);
  assert.match(text, /build\s+4m ago/);
  assert.match(text, /claude · working/);
  assert.match(text, /coupon\.go/);
  assert.match(text, /CI log/);
  const clean = renderDetail({ ...base, card: card({ statusCheckRollup: [] }) }, 80, 30).map(toPlain).join('\n');
  assert.equal(clean.includes('CI log'), false);
  assert.match(clean, /CI\s+none/);
  assert.match(renderDetail({ ...base, card: { ...c, agent: null } }, 80, 30).map(toPlain).join('\n'), /no agent connected/);
});

test('a failed log opens at the end, where the failure is', () => {
  const log = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
  const text = renderLog({ card: card(), lang: 'en', log, scroll: null, message: '' }, 60, 12).map(toPlain).join('\n');
  assert.match(text, /line 99/);
  assert.equal(text.includes('line 0\n'), false);
});

test('remote escape sequences never reach the screen', () => {
  const evil = card({ title: 'evil\u001b]52;c;aGk=\u0007\u001b[2Jtitle', statusCheckRollup: [{ name: 'x\u001b[31my', status: 'COMPLETED', conclusion: 'FAILURE' }] });
  const base = { cards: [evil], selectedKey: evil.key, card: evil, status, lang: 'en', now: NOW, scroll: 0, message: '' };
  const all = [renderList(base, 80, 20), renderDetail(base, 80, 30), renderLog({ ...base, log: 'a\u001b[2Jb' }, 80, 20)].flat().map(toPlain).join('\n');
  assert.equal(all.includes('\u001b'), false);
  assert.match(all, /eviltitle/);
});
