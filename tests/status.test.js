import test from 'node:test';
import assert from 'node:assert/strict';
import { checkState, prState } from '../src/status.js';
import { settingsFrom } from '../src/config.js';

const settings = settingsFrom({}, {});
const NOW = 10_000_000;
const ctx = (over = {}) => ({ now: NOW, headSeenAt: NOW - 3_600_000, threads: [], ...over });
const pr = (over = {}) => ({ state: 'OPEN', statusCheckRollup: [], latestReviews: [], mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', reviewDecision: '', ...over });
const ok = { name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' };
const bad = { name: 'unit', status: 'COMPLETED', conclusion: 'FAILURE' };
const running = { name: 'lint', status: 'IN_PROGRESS', conclusion: '' };
const name = (p, c) => prState(pr(p), ctx(c), settings).name;

test('reports the most blocking fact first', () => {
  assert.equal(name({ state: 'MERGED', statusCheckRollup: [bad] }), 'merged');
  assert.equal(name({ state: 'CLOSED' }), 'closed');
  assert.equal(name({ isDraft: true, statusCheckRollup: [bad] }), 'draft');
  assert.equal(name({ mergeable: 'CONFLICTING', statusCheckRollup: [bad] }), 'conflict');
  assert.equal(name({ statusCheckRollup: [bad, running] }), 'ci_failed');
  assert.equal(name({ statusCheckRollup: [ok, running] }), 'ci_running');
  assert.equal(name({ statusCheckRollup: [ok], reviewDecision: 'CHANGES_REQUESTED' }), 'changes');
  assert.equal(name({ statusCheckRollup: [ok], reviewDecision: 'REVIEW_REQUIRED' }), 'review_wait');
  assert.equal(name({ statusCheckRollup: [ok], mergeStateStatus: 'BEHIND' }), 'behind');
  assert.equal(name({ statusCheckRollup: [ok], mergeStateStatus: 'BLOCKED' }), 'blocked');
  assert.equal(name({ statusCheckRollup: [ok] }), 'ready');
});

test('a repo without CI says so and is never reported as passed', () => {
  const s = prState(pr(), ctx(), settings);
  assert.equal(s.ci.kind, 'none');
  assert.equal(s.name, 'ready');
});

test('a fresh commit waits for checks to appear before saying no CI', () => {
  assert.equal(prState(pr(), ctx({ headSeenAt: NOW - 30_000 }), settings).ci.kind, 'running');
});

test('open threads count; resolved and outdated ones do not', () => {
  const threads = [{ isResolved: false, isOutdated: false }, { isResolved: true, isOutdated: false }, { isResolved: false, isOutdated: true }];
  const s = prState(pr({ statusCheckRollup: [ok] }), ctx({ threads }), settings);
  assert.equal(s.name, 'comments');
  assert.equal(s.count, 1);
});

test('AI review running as a CI job is not CI', () => {
  const review = (conclusion, status = 'COMPLETED') => ({ name: 'claude-review', status, conclusion });
  const failed = prState(pr({ statusCheckRollup: [ok, review('FAILURE')] }), ctx(), settings);
  assert.equal(failed.ci.kind, 'passed');
  assert.equal(failed.ci.total, 1);
  assert.equal(failed.name, 'ready');
  assert.equal(prState(pr({ statusCheckRollup: [ok, review('', 'IN_PROGRESS')] }), ctx(), settings).name, 'ai_running');
  assert.equal(prState(pr({ statusCheckRollup: [ok, review('SUCCESS')] }), ctx(), settings).review, 'reviewed');
  assert.equal(name({ statusCheckRollup: [{ name: 'preview-deploy', status: 'COMPLETED', conclusion: 'FAILURE' }] }), 'ci_failed');
});

test('checkState covers check runs and legacy statuses', () => {
  assert.equal(checkState({ status: 'COMPLETED', conclusion: 'SKIPPED' }), 'passed');
  assert.equal(checkState({ status: 'COMPLETED', conclusion: 'TIMED_OUT' }), 'failed');
  assert.equal(checkState({ status: 'QUEUED' }), 'running');
  assert.equal(checkState({ __typename: 'StatusContext', state: 'ERROR' }), 'failed');
  assert.equal(checkState({ __typename: 'StatusContext', state: 'PENDING' }), 'running');
});
