import test from 'node:test';
import assert from 'node:assert/strict';
import { facts, steps, openThreads, logTail } from '../mods/pr-flow/present.js';
import { prState } from '../mods/pr-flow/status.js';
import { translator, relative, effectiveLang } from '../mods/pr-flow/i18n.js';

const t = translator('ko');
const settings = { aiChecks: [], ciWaitMs: 120_000 };
const NOW = Date.parse('2026-11-04T12:00:00Z');
const check = (name, status, conclusion, completedAt) => ({ name, status, conclusion, completedAt });
const card = (pr, threads = []) => {
  const full = { state: 'OPEN', mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', createdAt: '2026-11-04T11:00:00Z', ...pr };
  return { pr: full, threads, status: prState(full, { now: NOW, headSeenAt: 0, threads }, settings) };
};
const labels = (c) => facts(c, t).map((f) => f.label);

test('a failed check says CI failed and names no false pass', () => {
  const c = card({ statusCheckRollup: [check('test', 'COMPLETED', 'FAILURE')] });
  assert.deepEqual(labels(c), ['CI 실패', '리뷰 없음']);
  const s = steps(c, t, NOW);
  assert.equal(s[1].note, '1개 중 test 실패');
});

test('a repo with no CI says so and is never counted as passed', () => {
  const c = card({ statusCheckRollup: [], reviewDecision: 'REVIEW_REQUIRED', mergeStateStatus: 'BLOCKED' });
  assert.deepEqual(labels(c), ['CI 없음', '리뷰 대기']);
  assert.equal(steps(c, t, NOW)[1].label, 'CI 없음');
});

test('running CI shows how far it got', () => {
  const c = card({ statusCheckRollup: [check('a', 'COMPLETED', 'SUCCESS'), check('b', 'IN_PROGRESS')] });
  assert.deepEqual(labels(c).slice(0, 2), ['CI 실행 중', '1/2']);
});

test('merge readiness needs GitHub to have worked it out', () => {
  const pr = { statusCheckRollup: [check('a', 'COMPLETED', 'SUCCESS')], reviewDecision: 'APPROVED' };
  assert.ok(labels(card(pr)).includes('머지 가능'));
  assert.ok(!labels(card({ ...pr, mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' })).includes('머지 가능'));
});

test('merged shows only that, and the timeline says when', () => {
  const c = card({ state: 'MERGED', mergedAt: '2026-11-04T10:00:00Z' });
  assert.deepEqual(labels(c), ['머지됨']);
  assert.deepEqual(labels(card({ state: 'MERGED', baseRefName: 'live' })), ['머지됨 → live']);
  assert.deepEqual(steps(c, t, NOW).at(-1), { tone: 'ok', label: '머지됨', note: '2시간 전' });
});

test('changes requested names who asked and when', () => {
  const c = card({ reviewDecision: 'CHANGES_REQUESTED', latestReviews: [{ state: 'CHANGES_REQUESTED', author: { login: 'dana' }, submittedAt: '2026-11-04T11:54:00Z' }] });
  assert.deepEqual(steps(c, t, NOW)[2], { tone: 'warn', label: '변경 요청', note: '6분 전 · dana' });
});

test('resolved and outdated threads are not open comments', () => {
  const threads = [
    { isResolved: false, isOutdated: false, path: 'a.go', line: 3, comments: { nodes: [{ author: { login: 'x' }, body: 'fix' }] } },
    { isResolved: true, isOutdated: false, path: 'b.go', line: 1, comments: { nodes: [] } },
    { isResolved: false, isOutdated: true, path: 'c.go', line: 1, comments: { nodes: [] } },
  ];
  const c = card({}, threads);
  assert.deepEqual(openThreads(c), [{ where: 'a.go:3', who: 'x', body: 'fix' }]);
  assert.ok(labels(c).includes('1'));
});

test('log tail keeps the end and drops blanks', () => {
  assert.deepEqual(logTail('a\n\nb\nc  \n', 2), ['b', 'c']);
});

test('relative time reads naturally in both languages', () => {
  assert.equal(relative(30_000, t), '방금');
  assert.equal(relative(5 * 60_000, t), '5분 전');
  assert.equal(relative(3 * 86_400_000, translator('en')), '3d ago');
});

test('a language chosen in settings beats the system, and auto follows it', () => {
  assert.equal(effectiveLang('en', 'ko'), 'en');
  assert.equal(effectiveLang('ko', 'en'), 'ko');
  assert.equal(effectiveLang('auto', 'ko'), 'ko');
  assert.equal(effectiveLang(undefined, 'en'), 'en');
  assert.equal(effectiveLang('fr', 'fr'), 'en');
});
