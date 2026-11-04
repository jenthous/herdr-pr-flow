// The interactive pane: terminal setup and key handling. Every key only reads or moves focus.
import { parseDiff } from '../diff.js';
import { gh as defaultGh, runIdFromUrl } from '../gh.js';
import { translator } from '../i18n.js';
import { sanitize } from '../text.js';
import { toAnsi } from './cells.js';
import { renderDetail, renderDiff, renderList, renderLog } from './views.js';

const TOKEN = /\u001b\[[0-9;]*[A-Za-z~]|\u001bO[A-Z]|[\s\S]/gu;
const NAMED = { '\u001b[A': 'up', '\u001b[B': 'down', '\u001b[C': 'right', '\u001b[D': 'left', '\u001b[5~': 'pageup', '\u001b[6~': 'pagedown', '\u001bOA': 'up', '\u001bOB': 'down', '\r': 'enter', '\n': 'enter', '\u001b': 'esc', '\u0003': 'ctrl-c' };

export function parseKeys(chunk) {
  return (String(chunk).match(TOKEN) ?? []).map((token) => NAMED[token] ?? token);
}

export function createApp({ engine, herdr, gh = defaultGh, output = process.stdout, lang = 'en' }) {
  const t = translator(lang);
  const ui = { view: 'list', selectedKey: null, cardKey: null, scroll: 0, maxScroll: 0, files: null, fileIndex: 0, log: null, message: '' };
  let previous = [];
  let scheduled = false;
  let messageTimer = null;
  let onQuit = () => {};

  const size = () => ({ W: output.columns ?? 60, H: output.rows ?? 30 });
  const current = () => engine.cards().find((c) => c.key === ui.cardKey);

  function say(message) {
    ui.message = sanitize(message).split('\n')[0];
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => {
      ui.message = '';
      requestRender();
    }, 5000);
    requestRender();
  }

  function moveSelection(step) {
    const cards = engine.cards();
    const index = cards.findIndex((c) => c.key === ui.selectedKey);
    const next = cards[Math.max(0, Math.min(cards.length - 1, index + step))];
    if (next) ui.selectedKey = next.key;
  }

  function goToAgent(card) {
    if (!card?.agent) return say(t('no_agent_msg'));
    return herdr.focus(card.agent.pane_id).catch((error) => say(error.message));
  }

  function openDetail(card) {
    if (!card?.pr) return;
    Object.assign(ui, { view: 'detail', cardKey: card.key, scroll: 0 });
  }

  async function openDiff(card) {
    Object.assign(ui, { view: 'diff', files: null, fileIndex: 0, scroll: 0 });
    requestRender();
    try {
      ui.files = parseDiff(await gh.fetchDiff(card.url));
    } catch (error) {
      ui.files = [];
      say(error.message);
    }
    requestRender();
  }

  async function openLog(card) {
    const failed = card.status.ci.failed;
    if (!failed.length) return;
    Object.assign(ui, { view: 'log', log: null, scroll: null });
    requestRender();
    const ids = [...new Set(failed.map((c) => runIdFromUrl(c.url)).filter(Boolean))];
    if (ids.length) {
      const logs = await Promise.all(ids.map((id) => gh.failedLog(card.repo, id).catch((error) => error.message)));
      ui.log = sanitize(logs.join('\n'));
    } else {
      ui.log = sanitize(failed.map((c) => `${c.name}: ${c.url}`).join('\n'));
    }
    requestRender();
  }

  function scrollBy(step) {
    const base = ui.scroll === null ? ui.logTop ?? 0 : ui.scroll;
    ui.scroll = Math.max(0, Math.min(ui.maxScroll, base + step));
  }

  function handleScroll(key) {
    const page = Math.max(1, size().H - 4);
    if (key === 'down' || key === 'j') scrollBy(1);
    else if (key === 'up' || key === 'k') scrollBy(-1);
    else if (key === 'pagedown' || key === ' ') scrollBy(page);
    else if (key === 'pageup') scrollBy(-page);
    else return false;
    return true;
  }

  function handle(key) {
    if (key === 'ctrl-c') return quit();
    if (ui.view === 'list') {
      const card = engine.cards().find((c) => c.key === ui.selectedKey);
      if (key === 'down' || key === 'j') moveSelection(1);
      else if (key === 'up' || key === 'k') moveSelection(-1);
      else if (key === 'enter') openDetail(card);
      else if (key === 'g') return goToAgent(card);
      else if (key === 'R' && card) return engine.refresh(card.url);
      else if (key === 'q') return quit();
      return undefined;
    }
    const card = current();
    if (!card?.pr) {
      ui.view = 'list';
      return undefined;
    }
    if (ui.view === 'detail') {
      if (handleScroll(key)) return undefined;
      if (key === 'esc' || key === 'q') Object.assign(ui, { view: 'list', cardKey: null, scroll: 0 });
      else if (key === 'enter' || key === 'g') return goToAgent(card);
      else if (key === 'd') return openDiff(card);
      else if (key === 'l') return openLog(card);
      else if (key === 'o') return gh.openInBrowser(card.url).catch((error) => say(error.message));
      else if (key === 'R') return engine.refresh(card.url);
      return undefined;
    }
    if (handleScroll(key)) return undefined;
    if (key === 'esc' || key === 'q') Object.assign(ui, { view: 'detail', scroll: 0 });
    else if (ui.view === 'diff' && ui.files?.length && (key === ']' || key === '[')) {
      ui.fileIndex = Math.max(0, Math.min(ui.files.length - 1, ui.fileIndex + (key === ']' ? 1 : -1)));
      ui.scroll = 0;
    }
    return undefined;
  }

  function frame() {
    const { W, H } = size();
    const cards = engine.cards();
    if (!cards.some((c) => c.key === ui.selectedKey)) ui.selectedKey = cards[0]?.key ?? null;
    const model = { ...ui, card: null, cards, lang, status: engine.status(), now: Date.now() };
    if (ui.view !== 'list') {
      model.card = cards.find((c) => c.key === ui.cardKey);
      if (!model.card?.pr) ui.view = 'list';
    }
    const screen = { list: renderList, detail: renderDetail, diff: renderDiff, log: renderLog }[ui.view];
    const rows = screen(model, W, H);
    ui.maxScroll = model.maxScroll ?? 0;
    ui.logTop = model.logTop;
    return rows;
  }

  function render() {
    scheduled = false;
    const lines = frame().map(toAnsi);
    let out = '';
    lines.forEach((line, y) => {
      if (line !== previous[y]) out += `\u001b[${y + 1};1H${line}`;
    });
    previous = lines;
    if (out) output.write(out);
  }

  function requestRender() {
    if (scheduled) return;
    scheduled = true;
    setImmediate(render);
  }

  function restore() {
    output.write('\u001b[?25h\u001b[?1049l');
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  }

  function quit() {
    engine.stop();
    restore();
    onQuit();
  }

  return {
    frame,
    handle,
    ui,
    restore,
    async start(done) {
      onQuit = done;
      output.write('\u001b[?1049h\u001b[?25l\u001b[2J');
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', (chunk) => {
        parseKeys(chunk)
          .reduce((p, key) => p.then(() => handle(key)), Promise.resolve())
          .catch((error) => say(error.message))
          .finally(requestRender);
      });
      output.on('resize', () => {
        previous = [];
        output.write('\u001b[2J');
        requestRender();
      });
      engine.subscribe(requestRender);
      requestRender();
      setInterval(requestRender, 1000);
      await engine.start();
    },
  };
}
