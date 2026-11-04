import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/engine.js';
import { settingsFrom } from '../src/config.js';

const URL = 'https://github.com/acme/shop/pull/7';

function setup({ discoverUrl = URL, prOver = {}, status = 'idle' } = {}) {
  let time = 1_000_000_000;
  const world = { status, committedAt: null, pr: { number: 7, title: '쿠폰', url: URL, state: 'OPEN', headRefName: 'fix', headRefOid: 'sha1', statusCheckRollup: [], updatedAt: new Date(time).toISOString(), ...prOver } };
  const gh = {
    discover: async () => discoverUrl,
    fetchPr: async () => world.pr,
    fetchThreads: async () => ({ threads: [], headCommittedAt: world.committedAt }),
  };
  const herdr = { listAgents: async () => [{ pane_id: 'p1', agent: 'claude', agent_status: world.status, cwd: '/w/fix' }] };
  const git = { describe: async () => ({ root: '/w/fix', branch: 'fix', repo: 'acme/shop' }) };
  const store = { data: { tracked: {} }, save() {} };
  const engine = createEngine({ gh, herdr, git, store, settings: settingsFrom({}, {}), now: () => time });
  return { engine, world, store, gh, advance: (ms) => { time += ms; } };
}

async function boot(ctx) {
  await ctx.engine.start();
  ctx.engine.stop();
}

test('exposes only reading from GitHub and herdr', () => {
  // The fakes above have no write methods, so any write call would throw in these tests.
  const ctx = setup();
  assert.deepEqual(Object.keys(ctx.gh).sort(), ['discover', 'fetchPr', 'fetchThreads']);
});

test('finds the PR from the agent branch and links the agent', async () => {
  const ctx = setup();
  await boot(ctx);
  const [card] = ctx.engine.cards();
  assert.equal(card.number, 7);
  assert.equal(card.agent.pane_id, 'p1');
});

test('an agent with no PR shows nothing', async () => {
  const ctx = setup({ discoverUrl: null });
  await boot(ctx);
  assert.deepEqual(ctx.engine.cards(), []);
});

test('an agent finishing refreshes its PR right away', async () => {
  const ctx = setup({ status: 'working' });
  await boot(ctx);
  ctx.world.pr = { ...ctx.world.pr, title: 'pushed just now' };
  ctx.world.status = 'done';
  await ctx.engine.pollAgents();
  assert.equal(ctx.engine.cards()[0].pr.title, 'pushed just now');
});

test('an old commit does not wait for CI when first seen', async () => {
  const ctx = setup();
  ctx.world.committedAt = new Date(1_000_000_000 - 3_600_000).toISOString();
  await boot(ctx);
  assert.equal(ctx.engine.cards()[0].status.ci.kind, 'none');
});

test('a new commit waits for CI again', async () => {
  const ctx = setup();
  await boot(ctx);
  ctx.advance(600_000);
  await ctx.engine.refresh(URL);
  assert.equal(ctx.engine.cards()[0].status.ci.kind, 'none');
  ctx.world.pr = { ...ctx.world.pr, headRefOid: 'sha2' };
  await ctx.engine.refresh(URL);
  assert.equal(ctx.engine.cards()[0].status.ci.kind, 'running');
});

test('a merged PR stays 24 hours and a closed PR leaves', async () => {
  const ctx = setup();
  await boot(ctx);
  ctx.world.pr = { ...ctx.world.pr, state: 'MERGED', mergedAt: new Date(1_000_000_000).toISOString() };
  await ctx.engine.refresh(URL);
  assert.equal(ctx.engine.cards()[0].status.name, 'merged');
  ctx.advance(25 * 3_600_000);
  await ctx.engine.refresh(URL);
  assert.deepEqual(ctx.engine.cards(), []);

  const closed = setup();
  await boot(closed);
  closed.world.pr = { ...closed.world.pr, state: 'CLOSED' };
  await closed.engine.refresh(URL);
  assert.deepEqual(closed.engine.cards(), []);
});

test('open PRs sort by activity, merged PRs go last', async () => {
  const ctx = setup();
  await boot(ctx);
  const a = 'https://github.com/acme/shop/pull/1';
  const b = 'https://github.com/acme/shop/pull/2';
  ctx.gh.fetchPr = async (url) => ({
    [URL]: { ...ctx.world.pr, state: 'MERGED', mergedAt: new Date(1_000_000_000).toISOString(), updatedAt: new Date(2_000_000_000).toISOString() },
    [a]: { ...ctx.world.pr, number: 1, updatedAt: new Date(1_000).toISOString() },
    [b]: { ...ctx.world.pr, number: 2, updatedAt: new Date(2_000).toISOString() },
  }[url]);
  ctx.engine.track(a);
  ctx.engine.track(b);
  await Promise.all([URL, a, b].map((u) => ctx.engine.refresh(u)));
  assert.deepEqual(ctx.engine.cards().map((c) => c.number), [2, 1, 7]);
});

test('a failed refresh keeps the last data and reports the error', async () => {
  const ctx = setup();
  await boot(ctx);
  ctx.gh.fetchPr = async () => {
    throw new Error('rate limited');
  };
  await ctx.engine.refresh(URL);
  assert.equal(ctx.engine.cards()[0].number, 7);
  assert.match(ctx.engine.status().lastError, /rate limited/);
});
