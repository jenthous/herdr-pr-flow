import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, parseKeys } from '../src/ui/app.js';
import { classify } from '../src/classify.js';
import { parseConfig, settingsFor } from '../src/config.js';
import { emptyFixState } from '../src/autofix.js';

const settings = settingsFor(parseConfig(''), 'a/b');

function setup({ dryRun = false, mergeError = null } = {}) {
  const pr = { number: 7, title: 't', body: '## Test plan\n- [ ] one\n- [ ] two', url: 'u', state: 'OPEN', author: { login: 'me' }, headRefName: 'fix', headRefOid: 'pinnedsha', baseRefName: 'main', statusCheckRollup: [], latestReviews: [], reviewRequests: [], mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', reviewDecision: '' };
  const result = classify(pr, { now: 1e9, headSeenAt: 0, threads: [] }, settings);
  const entry = { fix: emptyFixState(), checked: {}, cwd: '/w', repo: 'a/b' };
  const data = { pr, threads: [], comments: [], repoInfo: { methods: ['squash', 'rebase'], defaultMethod: 'squash' } };
  const card = { key: 'u', url: 'u', entry, data, result, column: 'you', tone: 'warn', headline: 'x', number: 7, repo: 'a/b', agent: { pane_id: 'p1', agent: 'claude', agent_status: 'idle' } };
  const calls = { merges: [], prompts: [], comments: [], closes: [] };
  const gh = {
    fetchDiff: async () => '',
    merge: async (...args) => {
      if (mergeError) throw new Error(mergeError);
      calls.merges.push(args);
      pr.headRefOid = 'after';
    },
    comment: async (_url, body) => calls.comments.push(body),
    close: async (url) => calls.closes.push(url),
  };
  const herdr = { prompt: async (pane, text) => calls.prompts.push({ pane, text }), focus: async () => {} };
  const engine = {
    cards: () => [card], refresh: async () => {}, stop() {}, status: () => ({}), settingsOf: () => settings, save() {}, subscribe() {}, logsFor: async () => '', toggleAutoFix() {}, resetFix() {},
  };
  const output = { columns: 120, rows: 30, write() {}, on() {} };
  const app = createApp({ engine, herdr, gh, output, dryRun });
  return { app, calls, card, pr };
}

async function press(app, ...keys) {
  for (const key of keys) await app.handle(key);
}

test('parseKeys understands arrows, enter, escape and Korean text', () => {
  assert.deepEqual(parseKeys('\u001b[Aj\r'), ['up', 'j', 'enter']);
  assert.deepEqual(parseKeys('\u001b'), ['esc']);
  assert.deepEqual(parseKeys('한글'), ['한', '글']);
  assert.deepEqual(parseKeys('\u007f\t'), ['backspace', 'tab']);
});

test('merge uses the commit pinned when the dialog opened, even after a new push', async () => {
  const { app, calls, pr } = setup();
  app.frame();
  await press(app, 'enter', 'm');
  assert.equal(app.ui.view, 'merge');
  pr.headRefOid = 'newpush';
  await press(app, 'y');
  assert.deepEqual(calls.merges, [['u', 'squash', 'pinnedsha']]);
  assert.equal(app.ui.view, 'board');
});

test('merge only runs on y; n cancels and tab changes the method', async () => {
  const { app, calls } = setup();
  app.frame();
  await press(app, 'enter', 'm', 'enter', 'x', 'tab');
  assert.equal(app.ui.merge.method, 'rebase');
  assert.equal(calls.merges.length, 0);
  await press(app, 'n');
  assert.equal(app.ui.view, 'detail');
  assert.equal(calls.merges.length, 0);
});

test('a refused merge stays open and shows why', async () => {
  const { app } = setup({ mergeError: 'Head branch was modified' });
  app.frame();
  await press(app, 'enter', 'm', 'y');
  assert.equal(app.ui.view, 'merge');
  assert.match(app.ui.merge.error, /Not merged: Head branch was modified/);
  assert.equal(app.ui.merge.running, false);
});

test('dry run blocks merge, comment and agent prompts', async () => {
  const { app, calls } = setup({ dryRun: true });
  app.frame();
  await press(app, 'enter', 'm', 'y');
  assert.equal(calls.merges.length, 0);
  assert.match(app.ui.merge.error, /Dry run/);
  await press(app, 'n', 'a', 'c', 'h', 'i', 'enter', 'f', 'h', 'i', 'enter');
  assert.equal(calls.comments.length, 0);
  assert.equal(calls.prompts.length, 0);
});

test('typing into an input does not trigger shortcuts, and esc discards it', async () => {
  const { app, calls } = setup();
  app.frame();
  await press(app, 'enter', 'c', 'm', 'y', 'esc');
  assert.equal(app.ui.view, 'detail');
  assert.equal(calls.comments.length, 0);
  await press(app, 'c', '한', '글', 'backspace', 'enter');
  assert.deepEqual(calls.comments, ['한']);
});

test('closing a PR requires typing close', async () => {
  const { app, calls } = setup();
  app.frame();
  await press(app, 'enter', 'x', 'y', 'enter');
  assert.equal(calls.closes.length, 0);
  await press(app, 'x', 'c', 'l', 'o', 's', 'e', 'enter');
  assert.equal(calls.closes.length, 1);
});

test('test plan checks are tied to the commit', async () => {
  const { app, card, pr } = setup();
  app.frame();
  await press(app, 'enter', 't');
  assert.deepEqual(card.entry.checked.pinnedsha, [0]);
  pr.headRefOid = 'next';
  await press(app, 't');
  assert.deepEqual(Object.keys(card.entry.checked), ['next']);
  assert.deepEqual(card.entry.checked.next, [0]);
});
