#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from '../src/config.js';
import { createEngine } from '../src/engine.js';
import { gh, parsePrUrl } from '../src/gh.js';
import { localGit } from '../src/git.js';
import { herdr } from '../src/herdr.js';
import { acquireLock, createStore } from '../src/store.js';
import { parseDiff } from '../src/diff.js';
import { createApp } from '../src/ui/app.js';
import { toAnsi, toPlain } from '../src/ui/cells.js';
import { renderBoard, renderDetail, renderMerge } from '../src/ui/views.js';

const { values } = parseArgs({
  options: {
    dump: { type: 'boolean', default: false },
    plain: { type: 'boolean', default: false },
    pr: { type: 'string', multiple: true, default: [] },
    view: { type: 'string', default: 'board' },
    tab: { type: 'string', default: 'overview' },
    width: { type: 'string', default: '120' },
    height: { type: 'string', default: '30' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const stateDir = process.env.HERDR_PLUGIN_STATE_DIR ?? '';
const configDir = process.env.HERDR_PLUGIN_CONFIG_DIR ?? '';
const dryRun = values['dry-run'] || process.env.PR_FLOW_DRY_RUN === '1' || values.dump;
const logPath = stateDir ? join(stateDir, 'pr-flow.log') : '';
const log = (message) => {
  if (logPath) appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
  else if (values.dump) process.stderr.write(`${message}\n`);
};

let config;
try {
  config = loadConfig(configDir);
} catch (error) {
  process.stderr.write(`${error.message}\nFix ${join(configDir, 'config.toml')} and open PR Flow again.\n`);
  process.exit(1);
}

// Read-only snapshot of real data, without a terminal. Never sends or changes anything.
async function dump() {
  const store = { data: { tracked: {}, autoFixEnabled: true }, save() {} };
  const engine = createEngine({ gh, herdr, git: localGit, store, config, canAct: () => false, dryRun: true, log });
  await engine.start();
  engine.stop();
  for (const url of values.pr) {
    if (!parsePrUrl(url)) throw new Error(`Not a pull request URL: ${url}`);
    engine.track(url);
    await engine.refresh(url);
  }
  const W = Number(values.width);
  const H = Number(values.height);
  const cards = engine.cards();
  const card = cards.find((c) => !c.noPr && !c.loading);
  const base = { cards, selectedKey: card?.key ?? null, status: engine.status(), now: Date.now(), message: '' };
  let rows;
  if (values.view === 'board' || !card) rows = renderBoard(base, W, H);
  else {
    const files = parseDiff(await gh.fetchDiff(card.url));
    const ciLog = card.result.ci.kind === 'failed' ? await engine.logsFor(card.entry, card.result.ci) : '';
    const model = { ...base, card, tab: values.tab, scroll: 0, fileIndex: 0, files, threadIndex: 0, ciLog, merge: { methods: card.data.repoInfo?.methods ?? ['squash'], method: card.data.repoInfo?.defaultMethod ?? 'squash' } };
    rows = values.view === 'merge' ? renderMerge(model, W, H) : renderDetail(model, W, H);
  }
  process.stdout.write(`${rows.map(values.plain ? toPlain : toAnsi).join('\n')}\n`);
}

async function interactive() {
  const lock = acquireLock(stateDir);
  const store = createStore(stateDir);
  const engine = createEngine({ gh, herdr, git: localGit, store, config, canAct: () => lock.held, dryRun, log });
  const app = createApp({ engine, herdr, gh, dryRun, openUrl: process.env.PR_FLOW_OPEN_URL ?? '' });
  const leave = (code) => {
    lock.release();
    process.exit(code);
  };
  process.on('SIGTERM', () => {
    engine.stop();
    app.restore();
    leave(0);
  });
  process.on('SIGHUP', () => {
    engine.stop();
    leave(0);
  });
  process.on('uncaughtException', (error) => {
    app.restore();
    process.stderr.write(`${error.stack}\n`);
    leave(1);
  });
  await app.start(() => leave(0));
}

(values.dump ? dump() : interactive()).catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
