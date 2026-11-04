import test from 'node:test';
import assert from 'node:assert/strict';
import { runState, visibleSteps, position, flowSummary, flowActive, orderedRuns, FLOW_GRACE_MS } from '../../pr-flow/mods/pr-flow/flow.js';
import { flowLine, flowRows, jobSteps, issueState, issueLabel } from '../../pr-flow/mods/pr-flow/present.js';
import { createTracker } from '../../pr-flow/mods/pr-flow/tracker.js';
import { translator } from '../../pr-flow/mods/pr-flow/i18n.js';

const t = translator('ko');
const run = (id, name, status, conclusion = null, updatedAt = '2026-11-04T11:59:00Z') => ({ id, name, status, conclusion, url: `https://x/${id}`, updatedAt });
const step = (name, status, conclusion = null) => ({ name, status, conclusion });
const JOB = { name: 'deploy', status: 'in_progress', steps: [
  step('Set up job', 'completed', 'success'), step('Set up runner', 'completed', 'success'), step('Build', 'completed', 'success'), step('Lint', 'completed', 'skipped'),
  step('Sync to S3', 'in_progress'), step('Invalidate', 'pending'), step('Post Build', 'pending'), step('Complete job', 'pending'),
] };
const NOW = Date.parse('2026-11-04T12:00:00Z');

test('every run status GitHub reports has a state', () => {
  assert.equal(runState(run(1, 'a', 'completed', 'success')), 'ok');
  assert.equal(runState(run(1, 'a', 'completed', 'failure')), 'bad');
  assert.equal(runState(run(1, 'a', 'completed', 'timed_out')), 'bad');
  assert.equal(runState(run(1, 'a', 'completed', 'cancelled')), 'cancelled');
  assert.equal(runState(run(1, 'a', 'completed', 'skipped')), 'skipped');
  assert.equal(runState(run(1, 'a', 'waiting')), 'waiting');
  assert.equal(runState(run(1, 'a', 'in_progress')), 'running');
  assert.equal(runState(run(1, 'a', 'queued')), 'queued');
});

test('steps GitHub adds to every job are not counted', () => {
  assert.deepEqual(visibleSteps(JOB).map((s) => s.name), ['Build', 'Sync to S3', 'Invalidate']);
  assert.deepEqual(position([JOB]), { job: 'deploy', step: 'Sync to S3', index: 2, total: 3 });
});

test('between two steps the next one is shown', () => {
  const job = { name: 'd', status: 'in_progress', steps: [step('A', 'completed', 'success'), step('B', 'pending')] };
  assert.deepEqual(position([job]), { job: 'd', step: 'B', index: 2, total: 2 });
  assert.equal(position([{ name: 'd', status: 'completed', steps: [] }]), null);
});

test('failed runs lead, then running, and skipped runs are hidden', () => {
  const runs = [run(1, 'ok', 'completed', 'success'), run(2, 'skip', 'completed', 'skipped'), run(3, 'go', 'in_progress'), run(4, 'bad', 'completed', 'failure')];
  assert.deepEqual(orderedRuns(runs).map((r) => r.name), ['bad', 'go', 'ok']);
  const s = flowSummary(runs);
  assert.equal(s.kind, 'failed');
  assert.equal(s.more, 1);
});

const flowCard = (runs, jobs = {}, active = true) => ({ flow: { runs, jobs, active } });

test('the list line says where the run is, using the repo\'s own names', () => {
  const c = flowCard([run(1, 'Deploy', 'in_progress'), run(2, 'unit', 'in_progress')], { 1: { jobs: [JOB] } });
  assert.deepEqual(flowLine(c, t), { tone: 'run', label: 'Deploy · Sync to S3 (2/3)', more: '외 1개' });
});

test('the list line covers failure, approval, finished, not started and nothing', () => {
  assert.equal(flowLine(flowCard([run(1, 'security', 'completed', 'failure')]), t).label, 'security 실패');
  assert.equal(flowLine(flowCard([run(1, 'Deploy', 'waiting')]), t).label, 'Deploy · 승인 대기');
  assert.equal(flowLine(flowCard([run(1, 'a', 'completed', 'success'), run(2, 'b', 'completed', 'success')]), t).label, '머지 후 실행 2개 완료');
  assert.equal(flowLine(flowCard([], {}, true), t).label, '실행 확인 중…');
  assert.equal(flowLine(flowCard([], {}, false), t), null);
  assert.equal(flowLine({ flow: null }, t), null);
});

test('timeline rows carry notes and mark failures for the log link', () => {
  const rows = flowRows(flowCard([run(1, 'ok', 'completed', 'success'), run(2, 'bad', 'completed', 'failure')]), t, NOW);
  assert.deepEqual(rows.map((r) => [r.label, r.tone, r.note, r.failed]), [['bad', 'bad', '실패 · 1분 전', true], ['ok', 'ok', '1분 전', false]]);
});

test('opened runs list only real steps with their state', () => {
  assert.deepEqual(jobSteps([JOB])[0].steps, [{ name: 'Build', tone: 'ok' }, { name: 'Sync to S3', tone: 'run' }, { name: 'Invalidate', tone: 'todo' }]);
});

test('a merge stays watched through the wait for runs and between chained ones', () => {
  const merged = new Date(NOW - 60_000).toISOString();
  assert.equal(flowActive([], merged, NOW), true);
  assert.equal(flowActive([], new Date(NOW - FLOW_GRACE_MS - 1).toISOString(), NOW), false);
  assert.equal(flowActive([run(1, 'a', 'in_progress', null, new Date(NOW - 86_400_000).toISOString())], merged, NOW), true);
  const old = new Date(NOW - FLOW_GRACE_MS - 1).toISOString();
  assert.equal(flowActive([run(1, 'a', 'completed', 'success', old)], old, NOW), false);
});

test('issue state follows GitHub, including not planned', () => {
  assert.equal(issueState({ state: 'OPEN' }, t).label, '열림');
  assert.equal(issueState({ state: 'CLOSED', stateReason: 'COMPLETED' }, t).label, '닫힘');
  assert.equal(issueState({ state: 'CLOSED', stateReason: 'NOT_PLANNED' }, t).label, '계획 안 함');
});

test('every row says what it links to, including nothing', () => {
  assert.equal(issueLabel({ issues: [] }, t), '이슈 없음');
  assert.equal(issueLabel({}, t), '이슈 없음');
  assert.equal(issueLabel({ issues: [{ number: 5 }] }, t), '이슈 #5');
  assert.equal(issueLabel({ issues: [{ number: 5 }, { number: 6 }] }, t), '이슈 2개');
});

// The tracker end to end, with a clock and a fake GitHub.
const URL = 'https://github.com/o/r/pull/7';
function setup(runsNow) {
  let clock = NOW;
  const calls = { pr: 0, runs: 0, jobs: 0 };
  const box = { runs: runsNow };
  const tracker = createTracker({
    now: () => clock, settings: { pollMs: 30_000, ciWaitMs: 120_000, aiChecks: [] }, remoteOf: async () => 'o/r',
    store: { load: () => ({ [URL]: { url: URL, repo: 'o/r', number: 7, branch: 'b', headSha: 'a', headSeenAt: 0 } }), save() {} },
    gh: {
      discover: async () => null,
      fetchPr: async () => { calls.pr += 1; return { url: URL, title: 'T', body: '', state: 'MERGED', mergedAt: new Date(clock).toISOString(), mergeCommit: { oid: 'sha' }, headRefOid: 'a', statusCheckRollup: [], updatedAt: new Date(clock).toISOString() }; },
      fetchThreads: async () => ({ threads: [], issues: [{ number: 5, title: 'I‮', state: 'OPEN', url: 'u' }] }),
      fetchRuns: async () => { calls.runs += 1; return box.runs; },
      fetchJobs: async () => { calls.jobs += 1; return [JOB]; },
    },
  });
  return { tracker, calls, box, advance: (ms) => { clock += ms; } };
}

test('a merged PR with a running workflow keeps polling Actions only, then stops', async () => {
  const { tracker, calls, box, advance } = setup([run(1, 'Deploy', 'in_progress', null, new Date(NOW).toISOString())]);
  await tracker.tick([]);
  assert.equal(calls.pr, 1);
  assert.equal(calls.jobs, 1);
  assert.equal(flowLine(tracker.cards()[0], t).label, 'Deploy · Sync to S3 (2/3)');
  assert.equal(tracker.cards()[0].issues[0].title, 'I');
  await tracker.tick([]);
  assert.equal(calls.runs, 1); // not due yet
  advance(16_000);
  await tracker.tick([]);
  assert.equal(calls.runs, 2);
  assert.equal(calls.pr, 1);
  box.runs = [run(1, 'Deploy', 'completed', 'success', new Date(NOW).toISOString())];
  advance(16_000);
  await tracker.tick([]);
  assert.equal(calls.jobs, 3); // one last time, to keep the final steps
  advance(FLOW_GRACE_MS + 1);
  await tracker.tick([]); await tracker.tick([]);
  const settled = calls.runs;
  advance(60_000);
  await tracker.tick([]);
  assert.equal(calls.runs, settled);
  assert.equal(tracker.cards()[0].flow.active, false);
});

test('a merged PR stays past a day while its workflow still runs', async () => {
  const { tracker, advance } = setup([run(1, 'Deploy', 'waiting', null, new Date(NOW).toISOString())]);
  await tracker.tick([]);
  advance(25 * 3_600_000);
  await tracker.tick([]);
  assert.equal(tracker.cards().length, 1);
});

test('a finished run\'s jobs load once, on request', async () => {
  const { tracker, calls } = setup([run(1, 'Deploy', 'completed', 'success', new Date(NOW).toISOString())]);
  await tracker.tick([]);
  assert.equal(calls.jobs, 0);
  await tracker.loadJobs(URL, 1); await tracker.loadJobs(URL, 1);
  assert.equal(calls.jobs, 1);
});
