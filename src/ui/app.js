// The interactive pane: terminal setup, key handling, and the actions behind each key.
import { parseDiff } from '../diff.js';
import { gh as defaultGh, runIdFromCheck } from '../gh.js';
import { sanitize } from '../text.js';
import { COLUMNS } from '../classify.js';
import { toAnsi } from './cells.js';
import { renderBoard, renderDetail, renderMerge, testPlanState } from './views.js';

const TOKEN = /\u001b\[[0-9;]*[A-Za-z~]|\u001bO[A-Z]|[\s\S]/gu;
const NAMED = { '\u001b[A': 'up', '\u001b[B': 'down', '\u001b[C': 'right', '\u001b[D': 'left', '\u001b[5~': 'pageup', '\u001b[6~': 'pagedown', '\u001bOA': 'up', '\u001bOB': 'down', '\u001bOC': 'right', '\u001bOD': 'left', '\r': 'enter', '\n': 'enter', '\t': 'tab', '\u001b': 'esc', '\u007f': 'backspace', '\u0008': 'backspace', '\u0003': 'ctrl-c' };

export function parseKeys(chunk) {
  return (String(chunk).match(TOKEN) ?? []).map((token) => NAMED[token] ?? token);
}

export function createApp({ engine, herdr, gh = defaultGh, output = process.stdout, dryRun = false, openUrl = '' }) {
  const ui = { view: 'board', selectedKey: null, cardKey: null, tab: 'overview', scroll: 0, fileIndex: 0, files: null, threadIndex: 0, ciLog: null, input: null, merge: null, message: '', maxScroll: 0 };
  let previous = [];
  let scheduled = false;
  let messageTimer = null;

  const size = () => ({ W: output.columns ?? 120, H: output.rows ?? 30 });

  function say(message) {
    ui.message = sanitize(message).split('\n')[0];
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => {
      ui.message = '';
      requestRender();
    }, 6000);
    requestRender();
  }

  // Everything that writes to GitHub or a live agent goes through here, so dry run blocks all of it.
  async function perform(label, fn) {
    if (dryRun) return say(`Dry run: skipped ${label}.`);
    say(`${label}...`);
    try {
      await fn();
      say(`Done: ${label}.`);
      if (ui.cardKey) await engine.refresh(ui.cardKey);
    } catch (error) {
      say(`Could not ${label}: ${error.message}`);
    }
    return undefined;
  }

  const currentCard = () => engine.cards().find((c) => c.key === ui.cardKey);

  function byColumn(cards) {
    return COLUMNS.map((column) => cards.filter((c) => c.column === column));
  }

  function ensureSelection(cards) {
    if (cards.some((c) => c.key === ui.selectedKey)) return;
    const firstYours = cards.find((c) => c.column === 'you');
    ui.selectedKey = (firstYours ?? cards[0])?.key ?? null;
  }

  function moveSelection(dx, dy) {
    const cards = engine.cards();
    const columns = byColumn(cards);
    let col = columns.findIndex((list) => list.some((c) => c.key === ui.selectedKey));
    if (col < 0) return ensureSelection(cards);
    let row = columns[col].findIndex((c) => c.key === ui.selectedKey);
    if (dx) {
      let next = col + dx;
      while (next >= 0 && next < columns.length && !columns[next].length) next += dx;
      if (next < 0 || next >= columns.length) return undefined;
      col = next;
      row = Math.min(row, columns[col].length - 1);
    } else {
      row = Math.max(0, Math.min(columns[col].length - 1, row + dy));
    }
    ui.selectedKey = columns[col][row].key;
    return undefined;
  }

  async function openDetail(card) {
    if (!card || card.noPr || card.loading) return;
    Object.assign(ui, { view: 'detail', cardKey: card.key, tab: 'overview', scroll: 0, fileIndex: 0, files: null, threadIndex: 0, ciLog: null });
    requestRender();
    const [diff] = await Promise.all([gh.fetchDiff(card.url).catch((e) => ({ error: e.message })), loadCiLog(card)]);
    if (ui.cardKey !== card.key) return;
    if (diff?.error) {
      ui.files = [];
      say(`Could not load the diff: ${diff.error}`);
    } else ui.files = parseDiff(diff);
    requestRender();
  }

  async function loadCiLog(card) {
    if (card.result.ci.kind !== 'failed') {
      ui.ciLog = '';
      return;
    }
    ui.ciLog = sanitize(await engine.logsFor(card.entry, card.result.ci));
    requestRender();
  }

  const openThreads = (card) => (card.data.threads ?? []).filter((t) => !t.isResolved);

  function askInput(label, onSubmit) {
    ui.input = { label, value: '', onSubmit };
    requestRender();
  }

  function handleInput(key) {
    const { input } = ui;
    if (key === 'esc' || key === 'ctrl-c') ui.input = null;
    else if (key === 'enter') {
      const value = input.value.trim();
      ui.input = null;
      if (value) input.onSubmit(value);
    } else if (key === 'backspace') input.value = [...input.value].slice(0, -1).join('');
    else if ([...key].length === 1 && key >= ' ') input.value += key;
    requestRender();
  }

  function handleBoard(key) {
    const cards = engine.cards();
    const card = cards.find((c) => c.key === ui.selectedKey);
    switch (key) {
      case 'up': case 'k': return moveSelection(0, -1);
      case 'down': case 'j': return moveSelection(0, 1);
      case 'left': case 'h': return moveSelection(-1, 0);
      case 'right': case 'l': return moveSelection(1, 0);
      case 'enter': return openDetail(card);
      case 'g': return goToAgent(card);
      case 'a':
        engine.toggleAutoFix();
        if (card?.repo && !engine.settingsOf(card.repo).autoFix) say(`auto_fix is off for ${card.repo} in config.toml.`);
        return undefined;
      case 'R': return card?.url ? engine.refresh(card.url) : undefined;
      case 'q': case 'ctrl-c': return quit();
      default: return undefined;
    }
  }

  function goToAgent(card) {
    if (!card?.agent) return say('No agent is running for this PR.');
    return herdr.focus(card.agent.pane_id).catch((e) => say(`Could not open the agent: ${e.message}`));
  }

  function handleDetail(key) {
    const card = currentCard();
    if (!card) {
      ui.view = 'board';
      return undefined;
    }
    switch (key) {
      case 'esc': case 'q': ui.view = 'board'; ui.cardKey = null; return undefined;
      case 'ctrl-c': return quit();
      case 'tab': return switchTab(ui.tab === 'overview' ? 'diff' : ui.tab === 'diff' ? 'ci' : 'overview');
      case '1': return switchTab('overview');
      case '2': return switchTab('diff');
      case '3': return switchTab('ci');
      case 'down': case 'j': ui.scroll = Math.min(ui.maxScroll, ui.scroll + 1); return undefined;
      case 'up': case 'k': ui.scroll = Math.max(0, ui.scroll - 1); return undefined;
      case 'pagedown': case ' ': ui.scroll = Math.min(ui.maxScroll, ui.scroll + Math.max(1, size().H - 8)); return undefined;
      case 'pageup': ui.scroll = Math.max(0, ui.scroll - Math.max(1, size().H - 8)); return undefined;
      case ']': return moveFile(1);
      case '[': return moveFile(-1);
      case 'n': ui.threadIndex = Math.min(Math.max(0, openThreads(card).length - 1), ui.threadIndex + 1); ui.tab = 'overview'; return undefined;
      case 'p': ui.threadIndex = Math.max(0, ui.threadIndex - 1); ui.tab = 'overview'; return undefined;
      case 'y': return resolveThread(card);
      case 'c': return comment(card);
      case 'f': return sendFix(card);
      case 'a': return agentCheck(card);
      case 'l': return runLocally(card);
      case 't': return checkNext(card, 1);
      case 'T': return checkNext(card, -1);
      case 'r': return rerun(card);
      case 'z': engine.resetFix(card.url); return say('Auto-fix can try again.');
      case 'A': return perform('approve this PR', () => gh.approve(card.url));
      case 'C': return askInput('Request changes', (body) => perform('request changes', () => gh.requestChanges(card.url, body)));
      case 'u': return perform('update the branch', () => gh.updateBranch(card.url));
      case 'd': return card.data.pr.isDraft ? perform('mark ready', () => gh.markReady(card.url)) : perform('mark as draft', () => gh.markDraft(card.url));
      case 'x': return askInput(`Type close to close #${card.number}`, (value) => (value === 'close' ? perform('close this PR', () => gh.close(card.url)) : say('Not closed.')));
      case 'o': return gh.openInBrowser(card.url).catch((e) => say(e.message));
      case 'g': return goToAgent(card);
      case 'm': return openMerge(card);
      default: return undefined;
    }
  }

  function switchTab(tab) {
    ui.tab = tab;
    ui.scroll = 0;
  }

  function moveFile(step) {
    if (!ui.files?.length) return;
    ui.fileIndex = Math.max(0, Math.min(ui.files.length - 1, ui.fileIndex + step));
    switchTab('diff');
  }

  function resolveThread(card) {
    const thread = openThreads(card)[ui.threadIndex];
    if (!thread) return say('No open thread is selected.');
    return perform('resolve the thread', () => gh.resolveThread(thread.id));
  }

  function comment(card) {
    const thread = ui.tab === 'overview' ? openThreads(card)[ui.threadIndex] : null;
    if (thread) return askInput('Reply to thread', (body) => perform('reply', () => gh.replyThread(thread.id, body)));
    return askInput('Comment on PR', (body) => perform('comment', () => gh.comment(card.url, body)));
  }

  function sendFix(card) {
    if (!card.agent) return say('No agent is running for this PR.');
    return askInput('Tell the agent', (body) =>
      perform('send to the agent', () => herdr.prompt(card.agent.pane_id, `About PR #${card.number}: ${body}`)));
  }

  function agentCheck(card) {
    if (!card.agent) return say('No agent is running for this PR.');
    const plan = testPlanState(card);
    const list = plan.items.length ? ` Test plan:\n${plan.items.map((item) => `- ${sanitize(item)}`).join('\n')}` : '';
    return perform('ask the agent to verify', () =>
      herdr.prompt(card.agent.pane_id, `Verify that PR #${card.number} works by running it, and report what you checked and what you could not.${list}`));
  }

  function runLocally(card) {
    const { run } = engine.settingsOf(card.repo);
    if (!run) return say(`Set run for ${card.repo} in config.toml first.`);
    if (!card.entry.cwd) return say('This PR has no local checkout. Open it from an agent to run it here.');
    return perform(`run ${run}`, () => herdr.runBelow(card.entry.cwd, run));
  }

  function checkNext(card, direction) {
    const plan = testPlanState(card);
    if (!plan.total) return say('This PR has no test plan.');
    const sha = card.data.pr.headRefOid;
    const checked = [...plan.checked];
    if (direction > 0) {
      const next = plan.items.findIndex((_, i) => !checked.includes(i));
      if (next >= 0) checked.push(next);
    } else checked.pop();
    card.entry.checked = { [sha]: checked }; // a new commit starts the test plan over
    engine.save();
    return undefined;
  }

  function rerun(card) {
    const ids = [...new Set(card.result.ci.failed.map((f) => runIdFromCheck(f.check)).filter(Boolean))];
    if (!ids.length) return say('No failed GitHub Actions run to rerun.');
    return perform('rerun failed jobs', () => Promise.all(ids.map((id) => gh.rerunFailed(card.repo, id))));
  }

  function openMerge(card) {
    const methods = card.data.repoInfo?.methods?.length ? card.data.repoInfo.methods : ['squash', 'merge', 'rebase'];
    const preferred = card.data.repoInfo?.defaultMethod;
    ui.merge = { methods, method: methods.includes(preferred) ? preferred : methods[0], sha: card.data.pr.headRefOid, error: '', running: false };
    ui.view = 'merge';
  }

  async function handleMerge(key) {
    const { merge } = ui;
    const card = currentCard();
    if (merge.running) return;
    if (!card || key === 'n' || key === 'esc') {
      ui.view = card ? 'detail' : 'board';
      ui.merge = null;
      return;
    }
    if (key === 'tab') {
      merge.method = merge.methods[(merge.methods.indexOf(merge.method) + 1) % merge.methods.length];
      return;
    }
    if (key !== 'y') return;
    if (dryRun) {
      merge.error = 'Dry run: nothing was merged.';
      return;
    }
    merge.running = true;
    merge.error = '';
    requestRender();
    try {
      await gh.merge(card.url, merge.method, merge.sha);
      await engine.refresh(card.url);
      Object.assign(ui, { view: 'board', cardKey: null, merge: null });
      say(`#${card.number} merged. Delete its branch and worktree when you are done with them.`);
    } catch (error) {
      merge.running = false;
      merge.error = `Not merged: ${sanitize(error.message)}`;
    }
    requestRender();
  }

  function handle(key) {
    if (ui.input) return handleInput(key);
    if (ui.view === 'board') return handleBoard(key);
    if (ui.view === 'merge') return handleMerge(key);
    return handleDetail(key);
  }

  function frame() {
    const { W, H } = size();
    const cards = engine.cards();
    ensureSelection(cards);
    const focused = cards.find((c) => c.key === (ui.cardKey ?? ui.selectedKey));
    const model = { ...ui, card: null, cards, status: engine.status(focused?.repo), now: Date.now() };
    if (ui.view === 'board') return renderBoard(model, W, H);
    const card = cards.find((c) => c.key === ui.cardKey);
    if (!card?.data) {
      ui.view = 'board';
      return renderBoard(model, W, H);
    }
    model.card = card;
    const rows = ui.view === 'merge' ? renderMerge(model, W, H) : renderDetail(model, W, H);
    ui.maxScroll = model.maxScroll;
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

  let onQuit = () => {};
  function quit() {
    engine.stop();
    restore();
    onQuit();
  }

  return {
    frame,
    handle,
    ui,
    async start(done) {
      onQuit = done;
      output.write('\u001b[?1049h\u001b[?25l\u001b[2J');
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', (chunk) => {
        Promise.resolve(parseKeys(chunk).reduce((p, key) => p.then(() => handle(key)), Promise.resolve()))
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
      await engine.start();
      if (openUrl) {
        const entry = engine.track(openUrl);
        if (entry) {
          await engine.refresh(entry.url);
          ui.selectedKey = entry.url;
          await openDetail(engine.cards().find((c) => c.key === entry.url));
        }
      }
      setInterval(requestRender, 1000);
    },
    restore,
  };
}
