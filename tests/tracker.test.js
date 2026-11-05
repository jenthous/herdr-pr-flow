import test from 'node:test';
import assert from 'node:assert/strict';
import { createTracker } from '../mods/pr-flow/tracker.js';
import { createGh, cleanRunLog, parsePrUrl, parseRemote, runIdFromUrl } from '../mods/pr-flow/gh.js';
import { sanitize } from '../mods/pr-flow/text.js';

const URL = 'https://github.com/o/r/pull/7';
function setup({ prs = {}, onBranch = { 'o/r:feat': URL }, mine = null } = {}) {
  const calls = { discover: 0, fetch: 0, mine: 0 };
  let clock = 1_000_000;
  const gh = {
    discover: async (repo, branch) => { calls.discover += 1; return onBranch[`${repo}:${branch}`] ?? null; },
    fetchPr: async (url) => { calls.fetch += 1; return { url, title: 'T‮', body: '', state: 'OPEN', headRefOid: 'a', headRefName: 'feat', statusCheckRollup: [], updatedAt: '2026-01-01T00:00:00Z', ...prs[url] }; },
    fetchThreads: async () => ({ threads: [], headCommittedAt: null }),
    mine: async () => { calls.mine += 1; return mine ?? []; },
  };
  const saved = {};
  const tracker = createTracker({
    gh, settings: { pollMs: 30_000, ciWaitMs: 120_000, aiChecks: [], mine: mine !== null }, now: () => clock,
    remoteOf: async () => 'o/r',
    store: { load: () => ({}), save: (d) => Object.assign(saved, { d }) },
  });
  return { tracker, calls, saved, advance: (ms) => { clock += ms; } };
}
const agent = (over = {}) => ({ address: 't1', status: 'working', cwd: '/w', branch: 'feat', ...over });

test('an agent on a branch with a PR makes it appear, with that agent attached', async () => {
  const { tracker, saved } = setup();
  await tracker.tick([agent()]);
  const [card] = tracker.cards();
  assert.equal(card.number, 7);
  assert.equal(card.agent.address, 't1');
  assert.ok(saved.d[URL]);
});

test('untrusted titles are cleaned', async () => {
  const { tracker } = setup();
  await tracker.tick([agent()]);
  assert.equal(tracker.cards()[0].pr.title, 'T');
  assert.equal(sanitize('\u001b[31mred\u001b[0m\u0007'), 'red');
});

test('an agent on a branch with no PR asks again only after the wait', async () => {
  const { tracker, calls, advance } = setup({ onBranch: {} });
  await tracker.tick([agent()]);
  await tracker.tick([agent()]);
  assert.equal(calls.discover, 1);
  advance(31_000);
  await tracker.tick([agent()]);
  assert.equal(calls.discover, 2);
});

test('idle agents are asked less often than working ones', async () => {
  const { tracker, calls, advance } = setup({ onBranch: {} });
  await tracker.tick([agent({ status: 'idle' })]);
  advance(31_000);
  await tracker.tick([agent({ status: 'idle' })]);
  assert.equal(calls.discover, 1);
});

test('an agent finishing looks for a new PR right away', async () => {
  const { tracker, calls } = setup({ onBranch: {} });
  await tracker.tick([agent()]);
  await tracker.tick([agent({ status: 'done' })]);
  assert.equal(calls.discover, 2);
});

test('two agents on one branch ask once, and the working one is shown', async () => {
  const { tracker, calls } = setup({ onBranch: {} });
  await tracker.tick([agent({ status: 'idle' }), agent({ address: 't2' })]);
  assert.equal(calls.discover, 1);
});

test('a PR stays after its agent exits, and refreshes less often', async () => {
  const { tracker, calls, advance } = setup();
  await tracker.tick([agent()]);
  const before = calls.fetch;
  advance(31_000);
  await tracker.tick([]);
  assert.equal(calls.fetch, before);
  assert.equal(tracker.cards()[0].agent, null);
  advance(90_000);
  await tracker.tick([]);
  assert.equal(calls.fetch, before + 1);
});

test('closed PRs leave, merged ones stay a day, and a merged PR stops polling', async () => {
  const closed = setup({ prs: { [URL]: { state: 'CLOSED' } } });
  await closed.tracker.tick([agent()]);
  assert.equal(closed.tracker.cards().length, 0);
  const merged = setup({ prs: { [URL]: { state: 'MERGED', mergedAt: new Date(1_000_000).toISOString() } } });
  await merged.tracker.tick([agent()]);
  const fetched = merged.calls.fetch;
  merged.advance(60_000);
  await merged.tracker.tick([agent({ status: 'idle' })]);
  assert.equal(merged.tracker.cards().length, 1);
  assert.equal(merged.calls.fetch, fetched);
});

test('without `mine`, PRs without an agent are not searched for', async () => {
  const { tracker, calls } = setup({ onBranch: {} });
  await tracker.tick([]);
  assert.equal(calls.mine, 0);
  assert.equal(tracker.cards().length, 0);
});

test('with `mine`, your open PRs are listed without an agent, and searched again only after a while', async () => {
  const other = 'https://github.com/o/s/pull/3';
  const { tracker, calls, advance } = setup({ onBranch: {}, mine: [other, `${URL}/files`] });
  await tracker.tick([]);
  assert.deepEqual(tracker.cards().map((c) => c.number).sort(), [3, 7]);
  assert.equal(tracker.cards()[0].agent, null);
  advance(60_000);
  await tracker.tick([]);
  assert.equal(calls.mine, 1);
  advance(5 * 60_000);
  await tracker.tick([]);
  assert.equal(calls.mine, 2);
  assert.equal(tracker.cards().length, 2);
});

test('with `mine`, a PR an agent also sits on is listed once, with the agent', async () => {
  const { tracker } = setup({ mine: [URL] });
  await tracker.tick([agent()]);
  assert.equal(tracker.cards().length, 1);
  assert.equal(tracker.cards()[0].agent.address, 't1');
});

test('a gh failure keeps the row and reports the message', async () => {
  const { tracker } = setup();
  tracker.track(URL, 'feat');
  const failing = createTracker({
    gh: { discover: async () => null, fetchPr: async () => { throw new Error('auth required'); }, fetchThreads: async () => ({ threads: [] }) },
    settings: { pollMs: 1, ciWaitMs: 1, aiChecks: [] }, remoteOf: async () => 'o/r',
    store: { load: () => ({ [URL]: { url: URL, repo: 'o/r', number: 7, branch: 'feat', headSha: '', headSeenAt: 0 } }), save() {} },
  });
  await failing.tick([]);
  assert.equal(failing.cards()[0].loading, true);
  assert.equal(failing.lastError(), 'auth required');
});

test('createGh only ever calls read commands', async () => {
  const seen = [];
  const gh = createGh(async (cmd, args) => { seen.push([cmd, ...args].join(' ')); return { code: 0, stdout: (args[0] === 'pr' && args[1] === 'list') || args[0] === 'search' ? '[]' : '{"data":{"repository":{"pullRequest":{"reviewThreads":{"nodes":[]},"commits":{"nodes":[]}}}}}', stderr: '' }; });
  await gh.discover('o/r', 'feat'); await gh.mine(); await gh.fetchPr(URL); await gh.fetchThreads(URL); await gh.fetchDiff(URL); await gh.failedLog('o/r', '1'); await gh.authOk();
  for (const line of seen) assert.match(line, /^gh (pr (list|view|diff)|search prs|api graphql|run view|auth status)\b/);
  assert.ok(!seen.some((l) => /mutation|--method|--web/.test(l)));
});

test('createGh merges only the shown commit, with a known method', async () => {
  const seen = [];
  const gh = createGh(async (cmd, args) => { seen.push([cmd, ...args].join(' ')); return { code: 0, stdout: '', stderr: '' }; });
  await gh.merge(URL, 'squash', 'abc');
  assert.deepEqual(seen, [`gh pr merge ${URL} --squash --match-head-commit abc`]);
  await assert.rejects(gh.merge(URL, 'admin', 'abc'), /unknown merge method/);
  assert.equal(seen.length, 1);
});

test('createGh turns a failed command into an error with its message', async () => {
  const gh = createGh(async () => ({ code: 1, stdout: '', stderr: 'nope' }));
  await assert.rejects(gh.fetchDiff(URL), /nope/);
});

test('parsers', () => {
  assert.equal(parsePrUrl(`${URL}/files`).number, 7);
  assert.equal(parsePrUrl('https://evil.example/o/r/pull/7'), null);
  assert.equal(parseRemote('git@github.com:o/r.git'), 'o/r');
  assert.equal(parseRemote('https://gitlab.com/o/r'), null);
  assert.equal(runIdFromUrl('https://github.com/o/r/actions/runs/55/job/1'), '55');
  assert.equal(cleanRunLog('job\tstep\t2026-01-01T00:00:00.000Z boom\n##[group]x'), 'boom');
  // GitHub starts a log with a byte order mark, and marks errors with a prefix.
  assert.equal(cleanRunLog('unit\tRun\t\ufeff2026-11-03T15:32:58.7760071Z ##[group]Run\nunit\tRun\t2026-11-03T15:32:59.0Z ##[error]Process failed'), 'Process failed');
});
