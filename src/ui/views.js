// Pure screens: (model, W, H) => rows. No I/O, so every screen can be tested for exact width.
import { agoText, translator } from '../i18n.js';
import { sanitize, truncate, wrap } from '../text.js';
import { fit, keys, s, split, tint } from './cells.js';

const PAD = ' ';

function finish(rows, footer, W, H) {
  const body = rows.slice(0, H - 1).map((row) => fit(row, W, row.bg));
  while (body.length < H - 1) body.push(fit([], W));
  body.push(fit(footer, W));
  return body;
}

const footerRow = (model, items) => (model.message ? [s(` ${sanitize(model.message)}`, 'warn')] : keys(items));

function stateText(status, t) {
  return status.name === 'comments' ? t('comments', status.count) : t(status.name);
}

function stepChips(status, t) {
  const out = [];
  const add = (text, style) => out.push(s(text, style), s(' · ', 'f1'));
  const { ci, review } = status;
  if (ci.kind === 'passed') add(`${t('ci')} ✓`, 'ok');
  else if (ci.kind === 'failed' && status.name !== 'ci_failed') add(`${t('ci')} ✗`, 'bad');
  else if (ci.kind === 'none') add(t('no_ci'), 'f1');
  if (review === 'approved' || review === 'reviewed') add(`${t('review')} ✓`, 'ok');
  out.pop();
  return out;
}

function statusLine(status, t) {
  const chips = stepChips(status, t);
  return [...chips, ...(chips.length ? [s(' → ', 'f1')] : []), s(stateText(status, t), status.tone)];
}

const DOT = { ok: ['●', 'ok'], bad: ['●', 'bad'], warn: ['●', 'warn'], cya: ['○', 'cya'], pur: ['✓', 'pur'], f1: ['○', 'f1'] };

function cardRows(card, t, selected) {
  const repo = card.repo.split('/')[1];
  let rows;
  if (card.loading) {
    rows = [[s('  ○ ', 'f1'), s(`${repo} #${card.number}`)], [s('    '), s(card.error ? truncate(sanitize(card.error), 200) : t('loading'), card.error ? 'bad' : 'f1')]];
  } else {
    const [dot, style] = DOT[card.status.tone] ?? DOT.f1;
    rows = [
      [s(' '), s(`${dot} `, style), s(sanitize(card.pr.title), 'B')],
      [s('   '), s(`${repo} #${card.number}`, 'f1')],
      [s('   '), ...statusLine(card.status, t)],
    ];
  }
  return [...rows.map((row) => (selected ? tint(row, 'bgS') : row)), []];
}

export function renderList(model, W, H) {
  const { cards, selectedKey, status, lang, now } = model;
  const t = translator(lang);
  const open = cards.filter((c) => c.pr?.state !== 'MERGED').length;
  const right = status.lastError
    ? [s(truncate(sanitize(status.lastError), Math.max(1, W - 10), true), 'bad')]
    : [s(`${t('count', open)}${status.lastSync ? ` · ${t('synced', agoText(now - status.lastSync, lang))}` : ''} `, 'f1')];
  const header = [split(W, [s(` ${t('list_title')}`, 'B')], right), []];
  const footer = footerRow(model, [['↵', t('k_open')], ['g', t('k_agent')], ['q', t('k_quit')]]);

  if (!cards.length) {
    return finish([...header, [s(` ${t('empty_title')}`, 'B')], ...wrap(t('empty_body'), W - 2).map((line) => [s(`${PAD}${line}`, 'f1')])], footer, W, H);
  }
  const perCard = 4;
  const room = Math.max(1, Math.floor((H - 3) / perCard));
  const index = Math.max(0, cards.findIndex((c) => c.key === selectedKey));
  const start = index >= room ? index - room + 1 : 0;
  const visible = cards.slice(start, start + room);
  return finish([...header, ...visible.flatMap((c) => cardRows(c, t, c.key === selectedKey))], footer, W, H);
}

const pipe = (mark, style, text, note, W) => split(W, [s(`  ${mark} `, style), s(sanitize(text))], [s(`${note} `, 'f1')]);
const section = (text, right = []) => [[], split(1000, [s(` ${text}`, 'f1')], right).slice(0, 1).concat(right.length ? [s('  '), ...right] : [])];

export function renderDetail(model, W, H) {
  const { card, lang, now, scroll = 0 } = model;
  const t = translator(lang);
  const { pr, status, agent } = card;
  const ago = (date) => (date ? t('ago', agoText(now - Date.parse(date), lang)) : '');
  const rows = [
    split(W, [s(` ← #${card.number}`, 'B')], [s(`${stateText(status, t)} `, status.tone)]),
    [],
    ...wrap(pr.title, W - 2).map((line) => [s(`${PAD}${line}`, 'B')]),
    [s(`${PAD}${card.repo.split('/')[1]} · ${sanitize(pr.headRefName)} → ${sanitize(pr.baseRefName)}`, 'f1')],
    ...section(t('progress')),
    pipe('✓', 'ok', t('pr_opened'), ago(pr.createdAt), W),
  ];
  const { ci, review } = status;
  if (ci.kind === 'none') rows.push(pipe('–', 'f1', t('ci'), t('none'), W));
  if (ci.kind === 'running' && !ci.checks.length) rows.push(pipe('◆', 'cya', t('ci'), t('waiting'), W));
  for (const c of ci.checks) {
    const mark = { passed: ['✓', 'ok'], failed: ['✗', 'bad'], running: ['◆', 'cya'] }[c.state];
    rows.push(pipe(mark[0], mark[1], c.name, c.state === 'running' ? t('ci_running') : ago(c.at), W));
  }
  for (const c of ci.ai) {
    const mark = { passed: ['✓', 'ok'], failed: ['!', 'warn'], running: ['◆', 'cya'] }[c.state];
    rows.push(pipe(mark[0], mark[1], c.name, c.state === 'running' ? t('ai_running') : ago(c.at), W));
  }
  const reviewRow = {
    approved: ['✓', 'ok', t('approved')], reviewed: ['✓', 'ok', ''], changes: ['✗', 'bad', t('changes')], required: ['◆', 'cya', t('waiting')], ai_running: ['◆', 'cya', t('ai_running')], none: ['–', 'f1', t('not_required')],
  }[review];
  rows.push(pipe(reviewRow[0], reviewRow[1], t('review'), reviewRow[2], W));
  if (status.comments) rows.push(pipe('!', 'warn', t('comments', status.comments), '', W));
  rows.push(pr.state === 'MERGED' ? pipe('✓', 'pur', t('merge'), ago(pr.mergedAt), W) : pipe('○', 'f1', t('merge'), status.name === 'ready' ? t('ready') : t('waiting'), W));

  rows.push(...section(t('agent')));
  rows.push(agent ? pipe('○', agent.agent_status === 'working' ? 'cya' : agent.agent_status === 'blocked' ? 'warn' : 'f1', `${agent.agent} · ${t(`a_${agent.agent_status}`)}`, '', W) : pipe('–', 'f1', t('no_agent'), '', W));
  if (agent && card.activity) rows.push([s('    '), s(card.activity, 'f1')]);

  rows.push(...section(t('files'), [s(`+${pr.additions ?? 0}`, 'ok'), s(' '), s(`−${pr.deletions ?? 0}`, 'bad')]));
  for (const f of pr.files ?? []) rows.push(split(W, [s(`${PAD}${PAD}`), s(truncate(sanitize(f.path), Math.max(1, W - 14), true))], [s(`+${f.additions} −${f.deletions} `, 'f1')]));

  const room = H - 1;
  const max = Math.max(0, rows.length - room);
  model.maxScroll = max;
  const items = [['↵', t('k_agent')], ['d', t('k_diff')], ...(ci.failed.length ? [['l', t('k_log')]] : []), ['o', t('k_web')], ['esc', t('k_back')]];
  return finish(rows.slice(Math.min(scroll, max)), footerRow(model, items), W, H);
}

export function renderLog(model, W, H) {
  const { card, lang, log, scroll = 0 } = model;
  const t = translator(lang);
  const lines = log === null ? [t('loading')] : log.trim() ? wrap(log, W - 2) : [t('no_log')];
  const room = H - 3;
  const max = Math.max(0, lines.length - room);
  model.maxScroll = max;
  // Failures are at the end of a log, so it opens at the bottom.
  const top = model.scroll === null ? max : Math.min(scroll, max);
  model.logTop = top;
  const header = [split(W, [s(` ← ${t('log_title')}`, 'B')], [s(`#${card.number} `, 'f1')]), []];
  return finish([...header, ...lines.slice(top, top + room).map((line) => [s(`${PAD}${line}`)])], footerRow(model, [['j k', t('k_scroll')], ['esc', t('k_back')]]), W, H);
}

export function renderDiff(model, W, H) {
  const { card, lang, files, fileIndex = 0, scroll = 0 } = model;
  const t = translator(lang);
  const file = files?.[fileIndex];
  const lines = [];
  if (files === null) lines.push([s(` ${t('loading')}`, 'f1')]);
  else if (!file) lines.push([s(` ${t('no_files')}`, 'f1')]);
  else {
    for (const line of file.lines) {
      if (line.kind === 'hunk') lines.push([s(` @@ ${sanitize(line.text)}`, 'f1')]);
      else if (line.kind === 'meta') lines.push([s(` ${line.text}`, 'f1')]);
      else {
        const mark = line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' ';
        const row = [s(`${String(line.newNo ?? line.oldNo).padStart(4)} `, 'f1'), s(`${mark} `, line.kind === 'add' ? 'ok' : line.kind === 'del' ? 'bad' : 'f1'), s(sanitize(line.text))];
        lines.push(line.kind === 'add' ? tint(row, 'bgA') : line.kind === 'del' ? tint(row, 'bgD') : row);
      }
    }
  }
  const room = H - 3;
  const max = Math.max(0, lines.length - room);
  model.maxScroll = max;
  const count = files?.length ? `${fileIndex + 1}/${files.length} ` : '';
  const header = [split(W, [s(` ← ${file ? sanitize(file.path) : t('diff_title')}`, 'B')], [s(count, 'f1')]), file ? [s(` #${card.number} `, 'f1'), s(`+${file.added}`, 'ok'), s(' '), s(`−${file.removed}`, 'bad')] : []];
  return finish([...header, ...lines.slice(Math.min(scroll, max), Math.min(scroll, max) + room)], footerRow(model, [['[ ]', t('k_file')], ['j k', t('k_scroll')], ['esc', t('k_back')]]), W, H);
}
