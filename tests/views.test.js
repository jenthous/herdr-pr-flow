import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../src/classify.js';
import { parseConfig, settingsFor } from '../src/config.js';
import { width } from '../src/text.js';
import { renderBoard, renderDetail, renderMerge } from '../src/ui/views.js';
import { toPlain } from '../src/ui/cells.js';
import { emptyFixState } from '../src/autofix.js';
import { parseDiff } from '../src/diff.js';

const settings = settingsFor(parseConfig(''), 'a/b');
const NOW = 1_000_000_000;

function makeCard(over = {}) {
  const pr = {
    number: 482, title: '쿠폰 할인 금액 반올림 오류 수정 — 아주 긴 제목이 들어와도 칸을 넘으면 안 됩니다 정말로', body: '설명입니다.\n## 테스트\n- [ ] 정액 쿠폰 확인\n- [ ] 정률 쿠폰 확인', state: 'OPEN', isDraft: false,
    author: { login: 'me' }, headRefName: 'fix/쿠폰', headRefOid: 'a3f91c2aaa', baseRefName: 'main', statusCheckRollup: [], latestReviews: [], reviewRequests: [], mergeStateStatus: 'CLEAN', mergeable: 'MERGEABLE', reviewDecision: '', changedFiles: 1,
    ...over.pr,
  };
  const threads = over.threads ?? [{ id: 't', isResolved: false, isOutdated: false, path: 'a.go', line: 2, comments: [{ author: { login: 'coderabbitai' }, body: '여기를 고쳐 주세요 '.repeat(20) }] }];
  const data = { pr, threads, comments: [{ author: { login: 'alice' }, body: '확인 부탁드립니다', createdAt: new Date(NOW - 60000).toISOString() }] };
  const result = classify(pr, { now: NOW, headSeenAt: 0, threads, agent: { agent_status: 'idle' }, autoFix: false }, settings);
  return { key: `k${pr.number}`, url: 'u', entry: { fix: emptyFixState(), checked: {} }, data, result, column: result.column, tone: result.tone, headline: result.headline, number: pr.number, repo: 'acme/쇼핑몰', agent: { agent: 'claude', agent_status: 'idle' } };
}

const files = parseDiff('diff --git a/a.go b/a.go\n@@ -1,2 +1,3 @@\n keep\n+새로운 줄 '.concat('가'.repeat(200), '\n-old\n'));
const status = { lastError: 'gh: 아주 긴 오류 메시지입니다 '.repeat(5), canAct: false, autoFix: true, dryRun: true, lastSync: NOW - 5000 };
const noPr = { key: 'n', noPr: true, column: 'agent', tone: 'dim', headline: '작업 중입니다', repo: 'acme/docs', branch: 'feat/긴-브랜치-이름-'.repeat(5), agent: { agent: 'claude', agent_status: 'working' } };

function assertExact(rows, W, H, label) {
  assert.equal(rows.length, H, `${label} height`);
  rows.forEach((row, y) => assert.equal(width(toPlain(row)), W, `${label} ${W}x${H} row ${y}: ${toPlain(row)}`));
}

const SIZES = [[160, 50], [120, 30], [100, 24], [89, 24], [80, 24], [60, 20], [40, 16]];

test('board rows are exactly the terminal width at every size, with Korean text', () => {
  const cards = [makeCard(), noPr, makeCard({ pr: { number: 2, state: 'MERGED' } }), ...Array.from({ length: 8 }, (_, i) => makeCard({ pr: { number: 100 + i } }))];
  for (const [W, H] of SIZES) {
    assertExact(renderBoard({ cards, selectedKey: 'k107', status, now: NOW, message: '' }, W, H), W, H, 'board');
    assertExact(renderBoard({ cards: [], selectedKey: null, status, now: NOW, message: '' }, W, H), W, H, 'empty');
    assertExact(renderBoard({ cards, selectedKey: 'n', status, now: NOW, message: '메시지 '.repeat(40) }, W, H), W, H, 'msg');
  }
});

test('detail rows are exact on every tab and with a long input', () => {
  const card = makeCard({ pr: { statusCheckRollup: [{ name: '실패한 체크', status: 'COMPLETED', conclusion: 'FAILURE' }] } });
  for (const [W, H] of SIZES) {
    for (const tab of ['overview', 'diff', 'ci']) {
      const model = { card, status, now: NOW, tab, scroll: 3, fileIndex: 0, files, threadIndex: 0, ciLog: '로그 '.repeat(200), message: '' };
      assertExact(renderDetail(model, W, H), W, H, `detail ${tab}`);
    }
    assertExact(renderDetail({ card, status, now: NOW, tab: 'diff', scroll: 0, fileIndex: 0, files: null, threadIndex: 0, ciLog: null, input: { label: 'comment', value: '가'.repeat(300) } }, W, H), W, H, 'input');
  }
});

test('merge dialog is exact and lists what did not verify the PR', () => {
  const card = makeCard({ threads: [] });
  for (const [W, H] of SIZES) {
    const model = { card, status, now: NOW, tab: 'overview', scroll: 0, fileIndex: 0, files, threadIndex: 0, ciLog: null, merge: { methods: ['squash', 'merge'], method: 'squash', error: '오류 '.repeat(60) } };
    assertExact(renderMerge(model, W, H), W, H, 'merge');
  }
  const big = renderMerge({ card, status, now: NOW, tab: 'overview', scroll: 0, fileIndex: 0, files, threadIndex: 0, ciLog: null, merge: { methods: ['squash'], method: 'squash' } }, 120, 40).map(toPlain).join('\n');
  assert.match(big, /No CI ran on this PR/);
  assert.match(big, /No AI review on this PR/);
  assert.match(big, /Test plan 0\/2/);
  assert.match(big, /a3f91c2/);
});

test('text cut off in a card shows an ellipsis and keeps the exact width', () => {
  const card = makeCard({ threads: [], pr: { statusCheckRollup: [{ name: '아주아주아주아주아주아주아주아주 긴 체크 이름', status: 'COMPLETED', conclusion: 'FAILURE' }] } });
  const rows = renderBoard({ cards: [card], selectedKey: card.key, status, now: NOW, message: '' }, 120, 30);
  assertExact(rows, 120, 30, 'ellipsis');
  assert.match(rows.map(toPlain).join('\n'), /…/);
});

test('remote escape sequences never reach the screen', () => {
  const card = makeCard({ pr: { title: 'evil\u001b]52;c;aGk=\u0007\u001b[2Jtitle', body: 'x\u001b[31my' }, threads: [] });
  const plain = renderDetail({ card, status, now: NOW, tab: 'overview', scroll: 0, fileIndex: 0, files, threadIndex: 0, ciLog: null }, 120, 30).map(toPlain).join('\n');
  assert.equal(plain.includes('\u001b'), false);
  assert.match(plain, /eviltitle/);
});
