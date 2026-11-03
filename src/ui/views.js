// Pure screens: (model, W, H) => rows. No I/O, so every screen can be tested for exact width.
import { mergeWarnings, parseTestPlan, stripHtmlComments } from '../classify.js';
import { ago, sanitize, truncate, wrap } from '../text.js';
import { box, fit, hcat, keys, s, split, tint } from './cells.js';

const COLUMN_DEFS = [
  ['agent', 'AGENT WORKING', 'cya'],
  ['waiting', 'WAITING', 'pnk'],
  ['you', 'YOUR TURN', 'warn'],
  ['merged', 'MERGED', 'ok'],
];
const TONE = { ok: 'ok', warn: 'warn', bad: 'bad', info: 'cya', dim: 'f1', merged: 'pur' };

const finish = (rows, W, H) => {
  const out = rows.slice(0, H).map((row) => fit(row, W));
  while (out.length < H) out.push(fit([], W));
  return out;
};

function headerRow(status, W, crumb) {
  const right = [];
  if (status.lastError) right.push(s(`${truncate(status.lastError, 40, true)}   `, 'bad'));
  if (!status.canAct) right.push(s('view only   ', 'warn'));
  if (status.dryRun) right.push(s('dry run   ', 'warn'));
  right.push(s('auto-fix ', 'f1'), s(status.autoFix ? 'ON ' : 'OFF ', status.autoFix ? 'ok' : 'warn'));
  return fit(split(W, [s(' PR Flow', 'B'), s(crumb, 'f1')], right), W, 'bg1');
}

export function ciChip(result) {
  const { ci } = result;
  if (ci.kind === 'none') return s('no CI', 'warn');
  if (ci.kind === 'starting') return s('CI ...', 'cya');
  if (ci.kind === 'failed') return s(`CI ✗ ${ci.passed}/${ci.total}`, 'bad');
  if (ci.kind === 'pending') return s(`CI ${ci.passed}/${ci.total}`, 'cya');
  return s(`CI ✓ ${ci.total}/${ci.total}`, 'ok');
}

export function aiChip(result) {
  const { ai } = result;
  if (ai.kind === 'none') return s('no AI', 'warn');
  if (ai.kind === 'pending') return s('AI ...', 'cya');
  if (ai.kind === 'comments') return s(`AI ${ai.open.length} open`, 'warn');
  if (ai.kind === 'failed') return s('AI ✗', 'warn');
  return s('AI ✓', 'ok');
}

function cardRows(card) {
  if (card.noPr) {
    return {
      title: card.repo.split('/')[1],
      a: [s('no PR yet ', 'f1'), s(sanitize(card.branch))],
      b: [s(card.headline, 'f1')],
    };
  }
  if (card.loading) return { title: `#${card.number} ${card.repo.split('/')[1]}`, a: [s(card.repo, 'f1')], b: [s(card.headline, 'f1')] };
  const fixes = card.entry.fix.attempts;
  return {
    title: `#${card.number} ${card.repo.split('/')[1]}`,
    a: [ciChip(card.result), s('  '), aiChip(card.result), ...(fixes ? [s(`  fix ${fixes}`, 'f1')] : [])],
    b: [s(sanitize(card.headline), TONE[card.tone] ?? 'f1')],
  };
}

function renderCard(card, w, selected) {
  const { title, a, b } = cardRows(card);
  const danger = card.tone === 'bad';
  return box(w, sanitize(title), [a, b], selected ? 'cya' : danger ? 'bad' : 'ln', selected ? 'cya B' : 'f0 B');
}

function columnRows(def, cards, selectedKey, w, height) {
  const [, name, color] = def;
  const head = [[s(` ${name}`, `${color} B`), s(` ${cards.length}`, 'f1')], [s(` ${'━'.repeat(Math.max(0, w - 2))}`, color)]];
  const perCard = 4;
  const capacity = Math.max(1, Math.floor((height - head.length - 1) / perCard));
  const selectedIndex = cards.findIndex((c) => c.key === selectedKey);
  const start = selectedIndex >= capacity ? selectedIndex - capacity + 1 : 0;
  const visible = cards.slice(start, start + capacity);
  const rows = [...head, ...visible.flatMap((c) => renderCard(c, w, c.key === selectedKey))];
  const hidden = cards.length - visible.length;
  if (hidden > 0) rows.push([s(` +${hidden} more`, 'f1')]);
  return rows;
}

function summaryPanel(card, W) {
  if (!card) return box(W, 'Nothing selected', [[s('Open a PR from an agent running in this herdr session. It appears here on its own.', 'f1')], []], 'ln', 'f1');
  if (card.noPr) {
    return box(W, `${card.repo} ${sanitize(card.branch)}`, [[s('This agent has no PR on its branch yet.', 'f1')], [s(`agent ${card.agent.agent ?? ''} · ${card.agent.agent_status}`, 'f1')]], 'cya', 'cya B');
  }
  if (card.loading) return box(W, `#${card.number} ${card.repo}`, [[s(card.headline, 'f1')], []], 'cya', 'cya B');
  const { result, data } = card;
  const human = data.pr.reviewDecision === 'REVIEW_REQUIRED' ? s('required', 'warn') : data.pr.reviewDecision === 'APPROVED' ? s('approved', 'ok') : data.pr.reviewDecision === 'CHANGES_REQUESTED' ? s('changes requested', 'bad') : s('not required', 'f1');
  return box(W, `#${card.number} ${sanitize(data.pr.title)}`, [
    [ciChip(result), s('    '), aiChip(result), s('    Reviewer ', 'f1'), human, s('    Merge state ', 'f1'), s(String(data.pr.mergeStateStatus ?? '').toLowerCase(), 'f0'), s('    Fixes ', 'f1'), s(`${card.entry.fix.attempts}`)],
    [s(`${card.repo} · ${sanitize(data.pr.headRefName)} · agent ${card.agent ? `${card.agent.agent} ${card.agent.agent_status}` : 'not running'}`, 'f1')],
  ], 'cya', 'cya B');
}

export function renderBoard(model, W, H) {
  const { cards, selectedKey, status, message } = model;
  const open = cards.filter((c) => !c.noPr && c.column !== 'merged').length;
  const crumb = `   ${open} open PR${open === 1 ? '' : 's'}${status.lastSync ? ` · synced ${ago(model.now - status.lastSync)} ago` : ''}`;
  const selected = cards.find((c) => c.key === selectedKey);
  const panel = summaryPanel(selected, W);
  const bodyHeight = Math.max(4, H - 3 - panel.length);
  const cw = Math.floor((W - 3) / 4);
  let body;
  if (cw >= 24) {
    const columns = COLUMN_DEFS.map((def) => columnRows(def, cards.filter((c) => c.column === def[0]), selectedKey, cw, bodyHeight));
    body = hcat(columns.flatMap((rows, i) => (i ? [{ sep: ' ' }, { rows, w: cw }] : [{ rows, w: cw }])));
  } else {
    const stacked = COLUMN_DEFS.flatMap((def) => {
      const group = cards.filter((c) => c.column === def[0]);
      if (!group.length) return [];
      return [[s(` ${def[1]}`, `${def[2]} B`), s(` ${group.length}`, 'f1')], ...group.flatMap((c) => renderCard(c, W, c.key === selectedKey))];
    });
    const selectedRow = stacked.findIndex((row) => row[1]?.t?.includes(selected ? (selected.noPr ? selected.repo.split('/')[1] : `#${selected.number}`) : '\u0000'));
    const start = selectedRow >= bodyHeight - 4 ? selectedRow - bodyHeight + 5 : 0;
    body = stacked.slice(start, start + bodyHeight);
  }
  const padded = body.slice(0, bodyHeight);
  while (padded.length < bodyHeight) padded.push([]);
  const footer = message ? [s(` ${truncate(sanitize(message), W - 2, true)}`, 'warn')] : keys([['←→↑↓', 'move'], ['enter', 'open'], ['g', 'go to agent'], ['a', 'auto-fix'], ['R', 'refresh'], ['q', 'quit']]);
  return finish([headerRow(status, W, crumb), [], ...padded, ...panel, footer], W, H);
}

export function testPlanState(card) {
  const items = parseTestPlan(card.data?.pr?.body);
  const checked = card.entry?.checked?.[card.data?.pr?.headRefOid] ?? [];
  return { items, checked, total: items.length, checkedCount: checked.length };
}

function sidePanels(model, w, height) {
  const { card, fileIndex, files, focusFiles } = model;
  const { result, data } = card;
  const plan = testPlanState(card);
  const checks = [
    [ciChip(result)],
    [aiChip(result)],
    ...(result.ci.kind === 'failed' ? result.ci.failed.slice(0, 3).map((f) => [s(`✗ ${sanitize(f.name)}`, 'bad')]) : []),
    ...(result.ci.kind === 'none' && result.ai.kind === 'none' ? [[s('Only you will check this PR.', 'warn')]] : []),
  ];
  const planRows = plan.total
    ? plan.items.map((item, i) => [s(plan.checked.includes(i) ? '[x] ' : '[ ] ', plan.checked.includes(i) ? 'ok' : 'f1'), s(sanitize(item))])
    : [[s('None in the PR body.', 'f1')]];
  const warnStyle = result.ci.kind === 'none' && result.ai.kind === 'none';
  const upper = [
    ...box(w, 'Checks', checks, warnStyle ? 'warn' : 'ln', warnStyle ? 'warn B' : 'f0 B'),
    ...box(w, `Test plan ${plan.checkedCount}/${plan.total}`, planRows.slice(0, 6)),
  ];
  const room = Math.max(1, height - upper.length - 2);
  const list = files ?? [];
  const start = Math.max(0, Math.min(fileIndex - Math.floor(room / 2), Math.max(0, list.length - room)));
  const fileRows = files === null
    ? [[s('Loading...', 'f1')]]
    : list.slice(start, start + room).map((f, i) => {
        const on = start + i === fileIndex;
        const stat = ` +${f.added} -${f.removed}`;
        const name = truncate(sanitize(f.path), Math.max(1, w - 5 - stat.length), true);
        const row = split(w - 4, [s(name, on ? 'cya B' : '')], [s(stat, 'f1')]);
        return on ? tint(row, 'bgS') : row;
      });
  return [...upper, ...box(w, `Files ${data.pr.changedFiles ?? list.length}`, fileRows, focusFiles ? 'cya' : 'ln', focusFiles ? 'cya B' : 'f0 B')];
}

function overviewLines(model, w) {
  const { card, threadIndex } = model;
  const { pr, threads = [], comments = [] } = card.data;
  const lines = [];
  for (const line of wrap(pr.title, w)) lines.push([s(line, 'B')]);
  lines.push([s(`${sanitize(pr.author?.login ?? '')} · ${sanitize(pr.headRefName)} → ${sanitize(pr.baseRefName)}`, 'f1')], []);
  const body = sanitize(stripHtmlComments(pr.body)).trim();
  if (body) for (const line of wrap(body, w)) lines.push([s(line)]);
  else lines.push([s('No description.', 'f1')]);
  lines.push([]);
  const open = threads.filter((t) => !t.isResolved);
  lines.push([s(`REVIEW THREADS ${open.length} open`, 'f1 B')]);
  threads.forEach((thread) => {
    const selected = open[threadIndex]?.id === thread.id;
    const first = thread.comments[0];
    const place = thread.path ? `${thread.path}${thread.line ? `:${thread.line}` : ''}` : 'PR';
    const state = thread.isResolved ? s(' resolved', 'ok') : thread.isOutdated ? s(' outdated', 'f1') : s('');
    const head = [s(selected ? '▸ ' : '  ', 'cya'), s(sanitize(first?.author?.login ?? ''), 'cya B'), s(` ${sanitize(place)}`, 'f1'), state];
    lines.push(selected ? tint(head, 'bgS') : head);
    if (!thread.isResolved) {
      for (const comment of thread.comments) for (const line of wrap(comment.body, w - 4).slice(0, 8)) lines.push([s('  │ ', 'ln'), s(line)]);
    }
  });
  lines.push([], [s(`COMMENTS ${comments.length}`, 'f1 B')]);
  comments.forEach((comment) => {
    lines.push([s(sanitize(comment.author?.login ?? ''), 'cya B'), s(` ${ago(model.now - Date.parse(comment.createdAt))} ago`, 'f1')]);
    for (const line of wrap(comment.body, w - 2).slice(0, 12)) lines.push([s(`  ${line}`)]);
  });
  return lines;
}

function diffLines(model, w) {
  const { files, fileIndex, card } = model;
  if (files === null) return [[s('Loading diff...', 'f1')]];
  if (!files.length) return [[s('No file changes.', 'f1')]];
  const file = files[fileIndex];
  const threads = (card.data.threads ?? []).filter((t) => t.path === file.path);
  const lines = [[s(sanitize(file.path), 'B'), s(`  +${file.added} -${file.removed}`, 'f1')], []];
  for (const line of file.lines) {
    if (line.kind === 'hunk') {
      lines.push([s(`  @@ ${sanitize(line.text)}`, 'f1')]);
      continue;
    }
    if (line.kind === 'meta') {
      lines.push([s(line.text, 'f1')]);
      continue;
    }
    const no = String(line.newNo ?? line.oldNo ?? '').padStart(4);
    const mark = line.kind === 'add' ? s('+ ', 'ok') : line.kind === 'del' ? s('- ', 'bad') : s('  ', 'f1');
    const row = [s(`${no} `, 'f1'), mark, s(truncate(sanitize(line.text), w - 7))];
    lines.push(line.kind === 'add' ? tint(row, 'bgA') : line.kind === 'del' ? tint(row, 'bgD') : row);
    if (line.kind !== 'del') {
      for (const thread of threads.filter((t) => t.line === line.newNo)) {
        const first = thread.comments[0];
        lines.push([s('     ┃ ', 'cya'), s(sanitize(first?.author?.login ?? ''), 'cya B'), s(thread.isResolved ? '  resolved' : '', 'ok')]);
        for (const text of wrap(first?.body ?? '', w - 8).slice(0, 6)) lines.push([s('     ┃ ', 'cya'), s(text, 'f1')]);
      }
    }
  }
  return lines;
}

function ciLines(model, w) {
  const { card, ciLog } = model;
  const checks = card.data.pr.statusCheckRollup ?? [];
  const { result } = card;
  const lines = [];
  if (!checks.length) lines.push([s(result.ci.kind === 'starting' ? 'Waiting for checks to appear...' : 'No CI ran on this PR.', 'warn')]);
  const failed = new Set(result.ci.failed.map((f) => f.name));
  for (const check of checks) {
    const name = check.name ?? check.context ?? 'check';
    const pending = check.status && check.status !== 'COMPLETED';
    const mark = failed.has(name) ? s('✗ ', 'bad') : pending || check.state === 'PENDING' ? s('◆ ', 'cya') : s('✓ ', 'ok');
    lines.push([mark, s(sanitize(name))]);
  }
  if (result.ci.kind === 'failed') {
    lines.push([], [s('FAILED LOG', 'f1 B')]);
    if (ciLog === null) lines.push([s('Loading log...', 'f1')]);
    else for (const line of wrap(ciLog, w)) lines.push([s(line)]);
  }
  return lines;
}

function rightPane(model, w, height) {
  const inner = w - 4;
  const tabs = [['1', 'Overview', 'overview'], ['2', 'Diff', 'diff'], ['3', 'CI', 'ci']];
  const tabRow = tabs.flatMap(([n, label, id]) => [s(` ${n} ${label} `, id === model.tab ? 'bgI ink B' : 'f1'), s(' ')]);
  const lines = model.tab === 'diff' ? diffLines(model, inner) : model.tab === 'ci' ? ciLines(model, inner) : overviewLines(model, inner);
  const room = Math.max(1, height - 4);
  const maxScroll = Math.max(0, lines.length - room);
  const scroll = Math.min(model.scroll, maxScroll);
  const visible = lines.slice(scroll, scroll + room);
  while (visible.length < room) visible.push([]);
  const position = lines.length > room ? ` ${scroll + 1}-${scroll + room}/${lines.length}` : '';
  return { rows: box(w, `#${model.card.number}${position}`, [tabRow, ...visible], 'cya', 'cya B'), maxScroll };
}

const DETAIL_KEYS = {
  overview: [['tab', 'next'], ['n', 'thread'], ['y', 'resolve'], ['c', 'comment'], ['f', 'send fix'], ['l', 'run'], ['t', 'test'], ['m', 'merge'], ['esc', 'back']],
  diff: [['tab', 'next'], ['[ ]', 'file'], ['j/k', 'scroll'], ['c', 'comment'], ['f', 'send fix'], ['l', 'run'], ['t', 'test'], ['m', 'merge'], ['esc', 'back']],
  ci: [['tab', 'next'], ['r', 'rerun failed'], ['j/k', 'scroll'], ['f', 'send fix'], ['l', 'run'], ['m', 'merge'], ['esc', 'back']],
};

export function renderDetail(model, W, H) {
  const { card, status, message, input } = model;
  const bodyHeight = H - 2;
  const crumb = `   ${card.repo} › #${card.number}`;
  const footer = input
    ? [s(` ${input.label}: `, 'warn B'), s(truncate(input.value, Math.max(1, W - input.label.length - 6))), s('█', 'cya')]
    : message
      ? [s(` ${truncate(sanitize(message), W - 2, true)}`, 'warn')]
      : keys(DETAIL_KEYS[model.tab]);
  let bodyRows;
  let maxScroll;
  if (W >= 90) {
    const lw = Math.min(40, Math.floor(W * 0.32));
    const right = rightPane(model, W - lw, bodyHeight);
    maxScroll = right.maxScroll;
    bodyRows = hcat([{ rows: sidePanels(model, lw, bodyHeight), w: lw }, { rows: right.rows, w: W - lw }]);
  } else {
    const right = rightPane(model, W, bodyHeight);
    maxScroll = right.maxScroll;
    bodyRows = right.rows;
  }
  const rows = finish([headerRow(status, W, crumb), ...bodyRows.slice(0, bodyHeight)], W, H - 1);
  rows.push(fit(footer, W));
  model.maxScroll = maxScroll;
  return rows;
}

// The merge dialog replaces the top of the detail screen, so it never hides the warnings.
export function renderMerge(model, W, H) {
  const { card, merge } = model;
  const plan = testPlanState(card);
  const warnings = mergeWarnings(card.result, { total: plan.total, checked: plan.checkedCount }, card.data.pr);
  const sha = (merge.sha ?? card.data.pr.headRefOid).slice(0, 7);
  const rows = [
    [s(`Merge #${card.number} into ${sanitize(card.data.pr.baseRefName)} at ${sha}`, 'B')],
    [s(sanitize(card.data.pr.title), 'f1')],
    [],
    ...merge.methods.map((method) => {
      const on = method === merge.method;
      const row = [s(on ? '▸ ' : '  ', 'cya'), s({ squash: 'Squash and merge', merge: 'Create a merge commit', rebase: 'Rebase and merge' }[method], on ? 'B' : '')];
      return on ? tint(row, 'bgS') : row;
    }),
    [],
    ...(warnings.length ? warnings.map((w) => [s('! ', 'warn B'), s(w, 'warn')]) : [[s(`✓ CI passed, AI review done${plan.total ? ', test plan complete' : ''}. Nothing is blocking this merge.`, 'ok')]]),
    [],
    [s('A new push to this branch cancels the merge.', 'f1')],
    ...(merge.running ? [[s('Merging...', 'cya')]] : []),
    ...(merge.error ? wrap(merge.error, Math.min(W - 8, 76)).map((line) => [s(line, 'bad')]) : []),
  ];
  const w = Math.min(W - 2, 80);
  const dialog = box(w, 'Merge', rows, 'warn', 'warn B');
  const indent = ' '.repeat(Math.max(0, Math.floor((W - w) / 2)));
  const base = renderDetail(model, W, H);
  for (let y = 1; y < H - 1; y += 1) {
    base[y] = fit(dialog[y - 1] ? [s(indent), ...dialog[y - 1]] : [], W);
  }
  base[H - 1] = fit(keys([['y', 'merge'], ['tab', 'method'], ['n', 'cancel']]), W);
  return base;
}
