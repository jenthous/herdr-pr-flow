#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadSettings } from '../src/config.js';
import { parseDiff } from '../src/diff.js';
import { createEngine } from '../src/engine.js';
import { gh } from '../src/gh.js';
import { localGit } from '../src/git.js';
import { herdr } from '../src/herdr.js';
import { createStore } from '../src/store.js';
import { createApp } from '../src/ui/app.js';
import { toAnsi, toPlain } from '../src/ui/cells.js';
import { renderDetail, renderDiff, renderList } from '../src/ui/views.js';

const { values } = parseArgs({
  options: {
    dump: { type: 'boolean', default: false },
    plain: { type: 'boolean', default: false },
    pr: { type: 'string', multiple: true, default: [] },
    view: { type: 'string', default: 'list' },
    width: { type: 'string', default: '60' },
    height: { type: 'string', default: '30' },
  },
});

let settings;
try {
  settings = loadSettings(process.env.HERDR_PLUGIN_CONFIG_DIR ?? '');
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

// One snapshot of real data, without a terminal.
async function dump() {
  const store = { data: { tracked: {} }, save() {} };
  const engine = createEngine({ gh, herdr, git: localGit, store, settings });
  await engine.start();
  engine.stop();
  for (const url of values.pr) {
    const entry = engine.track(url);
    if (!entry) throw new Error(`Not a pull request URL: ${url}`);
    await engine.refresh(entry.url);
  }
  const W = Number(values.width);
  const H = Number(values.height);
  const cards = engine.cards();
  const card = cards.find((c) => c.pr);
  const base = { cards, card, selectedKey: card?.key ?? null, lang: settings.lang, status: engine.status(), now: Date.now(), scroll: 0, fileIndex: 0, message: '' };
  let rows;
  if (values.view === 'detail' && card) rows = renderDetail(base, W, H);
  else if (values.view === 'diff' && card) rows = renderDiff({ ...base, files: parseDiff(await gh.fetchDiff(card.url)) }, W, H);
  else rows = renderList(base, W, H);
  process.stdout.write(`${rows.map(values.plain ? toPlain : toAnsi).join('\n')}\n`);
}

async function interactive() {
  const store = createStore(process.env.HERDR_PLUGIN_STATE_DIR ?? '');
  const engine = createEngine({ gh, herdr, git: localGit, store, settings });
  const app = createApp({ engine, herdr, gh, lang: settings.lang });
  process.on('SIGTERM', () => {
    engine.stop();
    app.restore();
    process.exit(0);
  });
  process.on('SIGHUP', () => {
    engine.stop();
    process.exit(0);
  });
  process.on('uncaughtException', (error) => {
    app.restore();
    process.stderr.write(`${error.stack}\n`);
    process.exit(1);
  });
  await app.start(() => process.exit(0));
}

(values.dump ? dump() : interactive()).catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
