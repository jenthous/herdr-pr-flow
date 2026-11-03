import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/engine.js';
import { parseConfig } from '../src/config.js';

const URL = 'https://github.com/acme/shop/pull/7';

function setup({ agentStatus = 'idle', prOver = {}, autoFix = true, canAct = true, dryRun = false, threads = [], discoverUrl = URL, branch = 'fix' } = {}) {
  const calls = { prompts: [], notifies: [], tokens: [] };
  let time = 1_000_000;
  const world = {
    pr: {
      number: 7, title: '쿠폰 수정', body: '', url: URL, state: 'OPEN', isDraft: false, author: { login: 'me' }, headRefName: 'fix', headRefOid: 'sha1', baseRefName: 'main',
      statusCheckRollup: [{ name: 'unit', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: 'https://github.com/acme/shop/actions/runs/99/job/1' }],
      reviewDecision: '', reviewRequests: [], latestReviews: [], mergeStateStatus: 'CLEAN', mergeable: 'MERGEABLE', ...prOver,
    },
    threads,
    status: agentStatus,
  };
  const gh = {
    viewer: async () => 'me',
    discover: async () => discoverUrl,
    fetchPr: async () => world.pr,
    fetchConversation: async () => ({ threads: world.threads, comments: [], headCommittedAt: world.committedAt ?? null }),
    repoInfo: async () => ({ defaultBranchRef: { name: 'main' }, squashMergeAllowed: true, viewerDefaultMergeMethod: 'SQUASH' }),
    recentReviewers: async () => [],
    failedLog: async () => 'assert failed at line 88',
  };
  const herdr = {
    listAgents: async () => [{ pane_id: 'p1', agent: 'claude', agent_status: world.status, cwd: '/w/fix', terminal_title_stripped: 'editing' }],
    prompt: async (pane, text) => calls.prompts.push({ pane, text }),
    notify: async (title, body) => calls.notifies.push({ title, body }),
    reportToken: async (_pane, _source, value) => calls.tokens.push(value),
  };
  const git = { describe: async () => ({ root: '/w/fix', branch, repo: 'acme/shop' }) };
  const store = { data: { tracked: {}, autoFixEnabled: autoFix }, save() {} };
  const logs = [];
  const engine = createEngine({ gh, herdr, git, store, config: parseConfig(''), canAct: () => canAct, dryRun, now: () => time, log: (m) => logs.push(m) });
  return { engine, calls, world, store, logs, advance: (ms) => { time += ms; } };
}

async function boot(ctx) {
  await ctx.engine.start();
  ctx.engine.stop();
}

test('finds the PR from the agent branch and sends the CI failure once', async () => {
  const ctx = setup();
  await boot(ctx);
  assert.equal(ctx.calls.prompts.length, 1);
  assert.equal(ctx.calls.prompts[0].pane, 'p1');
  assert.match(ctx.calls.prompts[0].text, /assert failed at line 88/);
  assert.match(ctx.calls.prompts[0].text, /UNTRUSTED/);
  await ctx.engine.refresh(URL);
  assert.equal(ctx.calls.prompts.length, 1);
  assert.equal(ctx.store.data.tracked[URL].fix.attempts, 1);
});

test('an agent that stops without a new commit comes back to you, and is not sent it again', async () => {
  const ctx = setup();
  await boot(ctx);
  assert.equal(ctx.engine.cards()[0].column, 'agent');
  assert.equal(ctx.engine.cards()[0].headline, 'CI failure sent to agent');
  ctx.advance(60_000);
  await ctx.engine.refresh(URL);
  const [card] = ctx.engine.cards();
  assert.equal(card.column, 'you');
  assert.equal(card.headline, 'agent stopped, CI still failing');
  assert.equal(ctx.calls.prompts.length, 1);
  assert.equal(ctx.calls.notifies.length, 1);
  assert.match(ctx.calls.notifies[0].title, /agent stopped/);
});

test('a new commit that still fails goes back to the agent', async () => {
  const ctx = setup();
  await boot(ctx);
  ctx.advance(60_000);
  await ctx.engine.refresh(URL);
  ctx.world.pr = { ...ctx.world.pr, headRefOid: 'sha2' };
  await ctx.engine.refresh(URL);
  assert.equal(ctx.calls.prompts.length, 2);
  assert.equal(ctx.engine.cards()[0].column, 'agent');
});

test('an agent finishing refreshes its PR right away', async () => {
  const ctx = setup({ agentStatus: 'working', prOver: { statusCheckRollup: [] } });
  await boot(ctx);
  ctx.world.pr = { ...ctx.world.pr, title: 'pushed just now' };
  ctx.world.status = 'done';
  await ctx.engine.pollAgents();
  assert.equal(ctx.engine.cards()[0].data.pr.title, 'pushed just now');
});

test('dry run logs the prompt and sends nothing', async () => {
  const ctx = setup({ dryRun: true });
  await boot(ctx);
  assert.equal(ctx.calls.prompts.length, 0);
  assert.match(ctx.logs[0], /\[dry-run\] would send to p1/);
});

test('a view-only board never sends or notifies', async () => {
  const ctx = setup({ canAct: false });
  await boot(ctx);
  assert.equal(ctx.calls.prompts.length, 0);
  assert.equal(ctx.calls.notifies.length, 0);
});

test('auto-fix off puts the failure on your turn and notifies', async () => {
  const ctx = setup({ autoFix: false });
  await boot(ctx);
  assert.equal(ctx.calls.prompts.length, 0);
  assert.equal(ctx.engine.cards()[0].column, 'you');
  assert.equal(ctx.calls.notifies.length, 1);
  assert.match(ctx.calls.notifies[0].title, /#7/);
});

test('someone else’s PR is never sent to the agent', async () => {
  const ctx = setup({ prOver: { author: { login: 'teammate' } } });
  await boot(ctx);
  assert.equal(ctx.calls.prompts.length, 0);
  assert.equal(ctx.engine.cards()[0].column, 'you');
});

test('a working agent is not interrupted', async () => {
  const ctx = setup({ agentStatus: 'working' });
  await boot(ctx);
  assert.equal(ctx.calls.prompts.length, 0);
  assert.equal(ctx.engine.cards()[0].column, 'agent');
});

test('new commit resets the wait for CI', async () => {
  const ctx = setup({ prOver: { statusCheckRollup: [], author: { login: 'me' } } });
  await boot(ctx);
  ctx.advance(10 * 60_000);
  await ctx.engine.refresh(URL);
  assert.equal(ctx.engine.cards()[0].result.ci.kind, 'none');
  ctx.world.pr = { ...ctx.world.pr, headRefOid: 'sha2' };
  await ctx.engine.refresh(URL);
  assert.equal(ctx.engine.cards()[0].result.ci.kind, 'starting');
});

test('an old commit does not wait for CI when first tracked', async () => {
  const ctx = setup({ prOver: { statusCheckRollup: [] } });
  ctx.world.committedAt = new Date(1_000_000 - 3_600_000).toISOString();
  await boot(ctx);
  assert.equal(ctx.engine.cards()[0].result.ci.kind, 'none');
});

test('an agent with a feature branch and no PR shows as no PR yet', async () => {
  const ctx = setup({ discoverUrl: null });
  await boot(ctx);
  ctx.engine.cards(); // first call loads the repo's default branch
  await new Promise((resolve) => setImmediate(resolve));
  const [card] = ctx.engine.cards();
  assert.equal(card.noPr, true);
  assert.equal(card.column, 'agent');
  assert.equal(card.branch, 'fix');
  assert.equal(ctx.calls.prompts.length, 0);
});

test('a blocked agent with no PR comes to your turn', async () => {
  const ctx = setup({ discoverUrl: null, agentStatus: 'blocked' });
  await boot(ctx);
  ctx.engine.cards();
  await new Promise((resolve) => setImmediate(resolve));
  const [card] = ctx.engine.cards();
  assert.equal(card.column, 'you');
  assert.equal(card.headline, 'agent needs your input');
});

test('an agent on the default branch with no PR is not shown', async () => {
  const ctx = setup({ discoverUrl: null, branch: 'main' });
  await boot(ctx);
  ctx.engine.cards();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(ctx.engine.cards(), []);
});

test('a merged PR leaves the auto-fix loop and shows in merged', async () => {
  const ctx = setup({ prOver: { state: 'MERGED', mergedAt: new Date(1_000_000).toISOString() } });
  await boot(ctx);
  assert.equal(ctx.calls.prompts.length, 0);
  assert.equal(ctx.engine.cards()[0].column, 'merged');
});
