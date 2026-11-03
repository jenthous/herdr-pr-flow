import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, checkState, isAiAuthor, mergeWarnings, parseTestPlan } from '../src/classify.js';
import { parseConfig, settingsFor } from '../src/config.js';

const settings = settingsFor(parseConfig(''), 'a/b');
const NOW = 10_000_000;
const pr = (over = {}) => ({ state: 'OPEN', statusCheckRollup: [], latestReviews: [], reviewRequests: [], mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', reviewDecision: '', ...over });
const ctx = (over = {}) => ({ now: NOW, headSeenAt: NOW - 3_600_000, threads: [], autoFix: true, agent: { agent_status: 'idle' }, expectsAi: false, ...over });
const ok = { status: 'COMPLETED', conclusion: 'SUCCESS', name: 'build' };
const bad = { status: 'COMPLETED', conclusion: 'FAILURE', name: 'unit' };
const running = { status: 'IN_PROGRESS', conclusion: '', name: 'lint' };
const aiThread = (id = 't1', over = {}) => ({ id, isResolved: false, isOutdated: false, comments: [{ author: { login: 'coderabbitai' }, body: 'x' }], ...over });
const humanThread = () => ({ id: 'h1', isResolved: false, isOutdated: false, comments: [{ author: { login: 'alice' }, body: 'x' }] });

test('repo with no CI and no AI is your turn with a warning, never reported as passed', () => {
  const r = classify(pr(), ctx(), settings);
  assert.equal(r.column, 'you');
  assert.equal(r.headline, 'nothing checked this PR');
  assert.equal(r.tone, 'warn');
  assert.equal(r.ci.kind, 'none');
  assert.equal(r.ai.kind, 'none');
});

test('a PR just pushed waits for CI to appear before saying no CI', () => {
  const r = classify(pr(), ctx({ headSeenAt: NOW - 30_000 }), settings);
  assert.equal(r.column, 'waiting');
  assert.equal(r.ci.kind, 'starting');
});

test('a late check moves the card back out of no CI', () => {
  const r = classify(pr({ statusCheckRollup: [running] }), ctx(), settings);
  assert.equal(r.ci.kind, 'pending');
  assert.equal(r.column, 'waiting');
});

test('CI with no AI review repo reaches ready', () => {
  const r = classify(pr({ statusCheckRollup: [ok] }), ctx(), settings);
  assert.equal(r.column, 'you');
  assert.equal(r.headline, 'ready to verify');
  assert.equal(r.ai.kind, 'none');
});

test('AI review with no CI repo reaches ready', () => {
  const r = classify(pr({ latestReviews: [{ author: { login: 'coderabbitai' } }] }), ctx(), settings);
  assert.equal(r.headline, 'ready to verify');
  assert.equal(r.ci.kind, 'none');
  assert.equal(r.ai.kind, 'done');
});

test('repo that usually gets AI review waits, then gives up after ai_wait', () => {
  const soon = classify(pr({ statusCheckRollup: [ok] }), ctx({ expectsAi: true, headSeenAt: NOW - 60_000 }), settings);
  assert.equal(soon.column, 'waiting');
  const late = classify(pr({ statusCheckRollup: [ok] }), ctx({ expectsAi: true, headSeenAt: NOW - 3_600_000 }), settings);
  assert.equal(late.ai.kind, 'none');
  assert.equal(late.column, 'you');
});

test('CI failure goes to the agent when auto-fix can act, otherwise to you', () => {
  assert.equal(classify(pr({ statusCheckRollup: [bad] }), ctx(), settings).column, 'agent');
  assert.equal(classify(pr({ statusCheckRollup: [bad] }), ctx({ autoFix: false }), settings).column, 'you');
  assert.equal(classify(pr({ statusCheckRollup: [bad] }), ctx({ agent: null }), settings).column, 'you');
});

test('stopped auto-fix shows the reason on your turn', () => {
  const r = classify(pr({ statusCheckRollup: [bad] }), ctx({ autoStopped: 'same CI failure x3' }), settings);
  assert.equal(r.column, 'you');
  assert.equal(r.headline, 'same CI failure x3');
  assert.equal(r.tone, 'bad');
});

test('a working agent owns the card and shows its activity', () => {
  const r = classify(pr({ statusCheckRollup: [bad] }), ctx({ agent: { agent_status: 'working' }, activity: 'editing coupon.go' }), settings);
  assert.equal(r.column, 'agent');
  assert.equal(r.headline, 'editing coupon.go');
});

test('a blocked agent always comes to you', () => {
  assert.equal(classify(pr(), ctx({ agent: { agent_status: 'blocked' } }), settings).column, 'you');
});

test('human comments and requested changes are never sent to the agent automatically', () => {
  assert.equal(classify(pr({ reviewDecision: 'CHANGES_REQUESTED' }), ctx(), settings).column, 'you');
  assert.equal(classify(pr(), ctx({ threads: [humanThread()] }), settings).column, 'you');
});

test('AI comments go to the agent; resolved and outdated ones do not count', () => {
  assert.equal(classify(pr(), ctx({ threads: [aiThread()] }), settings).column, 'agent');
  assert.equal(classify(pr(), ctx({ threads: [aiThread('t', { isResolved: true })] }), settings).ai.kind, 'done');
  assert.equal(classify(pr(), ctx({ threads: [aiThread('t', { isOutdated: true })] }), settings).ai.kind, 'done');
});

test('required human review waits; conflict and rules come to you', () => {
  assert.equal(classify(pr({ statusCheckRollup: [ok], reviewDecision: 'REVIEW_REQUIRED' }), ctx(), settings).column, 'waiting');
  assert.equal(classify(pr({ mergeable: 'CONFLICTING' }), ctx(), settings).headline, 'merge conflict');
  assert.equal(classify(pr({ statusCheckRollup: [ok], mergeStateStatus: 'BLOCKED' }), ctx(), settings).headline, 'blocked by branch rules');
});

test('merged and closed PRs ignore everything else', () => {
  assert.equal(classify(pr({ state: 'MERGED', statusCheckRollup: [bad] }), ctx(), settings).column, 'merged');
  assert.equal(classify(pr({ state: 'CLOSED' }), ctx(), settings).column, 'closed');
});

test('isAiAuthor uses the built-in list, [bot] suffix handling and the allowlist', () => {
  assert.equal(isAiAuthor({ login: 'copilot-pull-request-reviewer' }, settings), true);
  assert.equal(isAiAuthor({ login: 'coderabbitai[bot]' }, settings), true);
  assert.equal(isAiAuthor({ login: 'alice' }, settings), false);
  assert.equal(isAiAuthor({ login: 'dependabot[bot]' }, settings), false);
  const custom = settingsFor(parseConfig('ai_reviewers = ["my-bot"]'), 'a/b');
  assert.equal(isAiAuthor({ login: 'my-bot' }, custom), true);
});

test('checkState covers check runs and legacy statuses', () => {
  assert.equal(checkState({ status: 'COMPLETED', conclusion: 'SKIPPED' }), 'passed');
  assert.equal(checkState({ status: 'COMPLETED', conclusion: 'TIMED_OUT' }), 'failed');
  assert.equal(checkState({ status: 'QUEUED' }), 'pending');
  assert.equal(checkState({ __typename: 'StatusContext', state: 'ERROR' }), 'failed');
  assert.equal(checkState({ __typename: 'StatusContext', state: 'PENDING' }), 'pending');
});

test('merge warnings name what did not verify the PR', () => {
  const r = classify(pr(), ctx(), settings);
  const w = mergeWarnings(r, { total: 3, checked: 1 });
  assert.deepEqual(w, ['No CI ran on this PR.', 'No AI review on this PR.', 'Test plan 1/3 checked.']);
});

test('AI review that runs as a CI job counts as AI, not CI', () => {
  const review = (conclusion, status = 'COMPLETED') => ({ name: 'claude-review', status, conclusion });
  const passed = classify(pr({ statusCheckRollup: [ok, review('SUCCESS')] }), ctx(), settings);
  assert.equal(passed.ci.total, 1);
  assert.equal(passed.ai.kind, 'done');
  assert.equal(passed.headline, 'ready to verify');

  const failed = classify(pr({ statusCheckRollup: [ok, review('FAILURE')] }), ctx(), settings);
  assert.equal(failed.ci.kind, 'passed');
  assert.equal(failed.ai.kind, 'failed');
  assert.equal(failed.column, 'you');
  assert.equal(failed.headline, 'AI review did not finish');

  const running = classify(pr({ statusCheckRollup: [ok, review('', 'IN_PROGRESS')] }), ctx(), settings);
  assert.equal(running.column, 'waiting');
  assert.equal(running.headline, 'waiting for AI review');
});

test('ordinary checks with review-like names stay CI, and ai_checks can add a name', () => {
  assert.equal(classify(pr({ statusCheckRollup: [{ name: 'preview-deploy', status: 'COMPLETED', conclusion: 'FAILURE' }] }), ctx(), settings).ci.kind, 'failed');
  assert.equal(classify(pr({ statusCheckRollup: [{ name: 'code-review-lint', status: 'COMPLETED', conclusion: 'FAILURE' }] }), ctx(), settings).ci.kind, 'failed');
  const custom = settingsFor(parseConfig('ai_checks = ["Our Bot"]'), 'a/b');
  assert.equal(classify(pr({ statusCheckRollup: [{ name: 'our bot', status: 'COMPLETED', conclusion: 'SUCCESS' }] }), ctx(), custom).ai.kind, 'done');
});

test('merge warnings never call a blocked PR clear', () => {
  const clean = classify(pr({ statusCheckRollup: [ok], latestReviews: [{ author: { login: 'coderabbitai' } }] }), ctx(), settings);
  assert.deepEqual(mergeWarnings(clean, { total: 0, checked: 0 }, { mergeStateStatus: 'CLEAN' }), []);
  const w = mergeWarnings(clean, { total: 0, checked: 0 }, { reviewDecision: 'REVIEW_REQUIRED', mergeStateStatus: 'BLOCKED', mergeable: 'CONFLICTING', isDraft: true });
  assert.deepEqual(w, ['This branch has merge conflicts.', 'A reviewer is still required.', 'Branch rules are blocking this merge.', 'This PR is a draft.']);
});

test('parseTestPlan reads lists under a test heading only', () => {
  assert.deepEqual(parseTestPlan('## Test plan\n- [ ] one\n* [x] two\n- three\n\n## Notes\n- [ ] not a test'), ['one', 'two', 'three']);
  assert.deepEqual(parseTestPlan('**테스트 방법**\n- 쿠폰 적용'), ['쿠폰 적용']);
  assert.deepEqual(parseTestPlan(null), []);
});

test('parseTestPlan ignores template checkboxes and HTML comments', () => {
  assert.deepEqual(parseTestPlan('## Authorship\n- [ ] A human wrote it.\n- [ ] An agent wrote it.'), []);
  assert.deepEqual(parseTestPlan('- [ ] no heading at all'), []);
  assert.deepEqual(parseTestPlan('<!--\n## Test plan\n- hidden\n-->\n## Test plan\n- shown'), ['shown']);
});
