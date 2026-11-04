import test from 'node:test';
import assert from 'node:assert/strict';
import { settingsFrom } from '../src/config.js';
import { prState } from '../src/status.js';
import { createApp, parseKeys } from '../src/ui/app.js';

const settings = settingsFrom({}, {});

function setup({ agent = true } = {}) {
  const mk = (number, over = {}) => {
    const pr = { number, title: `PR ${number}`, url: `u${number}`, state: 'OPEN', headRefName: 'b', baseRefName: 'main', statusCheckRollup: [{ name: 'unit', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: 'https://github.com/a/b/actions/runs/9/job/1' }], latestReviews: [], files: [], ...over };
    return { key: `u${number}`, url: `u${number}`, repo: 'a/b', number, pr, status: prState(pr, { now: 1e9, headSeenAt: 0, threads: [] }, settings), agent: agent ? { pane_id: 'p1', agent: 'claude', agent_status: 'idle' } : null };
  };
  const cards = [mk(1), mk(2)];
  const calls = { focus: [], logs: [], diffs: [], web: [], refresh: [] };
  const gh = {
    fetchDiff: async (url) => { calls.diffs.push(url); return 'diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b\ndiff --git a/y b/y\n@@ -1 +1 @@\n-c\n+d\n'; },
    failedLog: async (repo, id) => { calls.logs.push([repo, id]); return 'boom'; },
    openInBrowser: async (url) => { calls.web.push(url); },
  };
  const herdr = { focus: async (p) => calls.focus.push(p) };
  const engine = { cards: () => cards, status: () => ({ lastError: '', lastSync: 0 }), refresh: async (u) => calls.refresh.push(u), stop() {}, subscribe() {} };
  const app = createApp({ engine, herdr, gh, lang: 'en', output: { columns: 60, rows: 24, write() {}, on() {} } });
  return { app, calls, cards };
}

async function press(app, ...keys) {
  for (const key of keys) {
    await app.handle(key);
    app.frame();
  }
}

test('parseKeys understands arrows, enter and escape', () => {
  assert.deepEqual(parseKeys('\u001b[Aj\r'), ['up', 'j', 'enter']);
  assert.deepEqual(parseKeys('\u001b'), ['esc']);
});

test('the list moves within bounds and opens details', async () => {
  const { app } = setup();
  app.frame();
  await press(app, 'k');
  assert.equal(app.ui.selectedKey, 'u1');
  await press(app, 'j', 'j', 'j');
  assert.equal(app.ui.selectedKey, 'u2');
  await press(app, 'enter');
  assert.equal(app.ui.view, 'detail');
  assert.equal(app.ui.cardKey, 'u2');
  await press(app, 'esc');
  assert.equal(app.ui.view, 'list');
});

test('enter in details and g in the list go to the agent', async () => {
  const { app, calls } = setup();
  app.frame();
  await press(app, 'g', 'enter', 'enter');
  assert.deepEqual(calls.focus, ['p1', 'p1']);
});

test('no agent shows a message instead of failing', async () => {
  const { app, calls } = setup({ agent: false });
  app.frame();
  await press(app, 'g');
  assert.deepEqual(calls.focus, []);
  assert.match(app.ui.message, /No agent/);
});

test('d shows the diff and moves between files', async () => {
  const { app, calls } = setup();
  app.frame();
  await press(app, 'enter', 'd');
  assert.equal(app.ui.view, 'diff');
  assert.equal(app.ui.files.length, 2);
  await press(app, ']', ']');
  assert.equal(app.ui.fileIndex, 1);
  await press(app, '[', '[');
  assert.equal(app.ui.fileIndex, 0);
  await press(app, 'esc');
  assert.equal(app.ui.view, 'detail');
  assert.deepEqual(calls.diffs, ['u1']);
});

test('l loads the failed log by run id', async () => {
  const { app, calls } = setup();
  app.frame();
  await press(app, 'enter', 'l');
  assert.equal(app.ui.view, 'log');
  assert.deepEqual(calls.logs, [['a/b', '9']]);
  assert.equal(app.ui.log, 'boom');
});

test('no key writes anything: other letters do nothing on any screen', async () => {
  const { app, calls } = setup();
  app.frame();
  for (const key of ['m', 'y', 'c', 'f', 'a', 'x', 'A', 'C', 'u', 't', 'z', 'r']) await press(app, key);
  await press(app, 'enter');
  for (const key of ['m', 'y', 'c', 'f', 'a', 'x', 'A', 'C', 'u', 't', 'z', 'r']) await press(app, key);
  assert.equal(app.ui.view, 'detail');
  assert.deepEqual(calls.focus, []);
});
