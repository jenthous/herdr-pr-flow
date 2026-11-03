// Cell-accurate row layout. A row is an array of segments { t, c }; c holds style names.
import { truncate, width } from '../text.js';

export const THEME = {
  fg: { f0: '#bcbec4', f1: '#8c9097', acc: '#3574f0', cya: '#56a8f5', ok: '#6aab73', warn: '#e0bb65', bad: '#f75464', pur: '#c77dbb', pnk: '#cf8e6d', ln: '#43454a', ink: '#ffffff' },
  bg: { bg0: '#1e1f22', bg1: '#2b2d30', bg2: '#393b40', bgS: '#2e436e', bgA: '#28382c', bgD: '#402a2c', bgI: '#3574f0' },
};

export const s = (t, c = '') => ({ t: String(t), c });
const norm = (row) => (typeof row === 'string' ? [s(row)] : row);
export const rowWidth = (row) => norm(row).reduce((n, seg) => n + width(seg.t), 0);
export const tint = (row, bg) => Object.assign(norm(row), { bg });

export function fit(row, w, bg = '', ellipsis = false) {
  const out = [];
  let used = 0;
  for (const seg of norm(row)) {
    if (used >= w) break;
    const t = truncate(seg.t, w - used, ellipsis);
    out.push({ ...seg, t });
    used += width(t);
  }
  if (used < w) out.push(s(' '.repeat(w - used)));
  const fill = row.bg || bg;
  return out.map((seg) => ({ ...seg, c: /\bbg\w/.test(seg.c) || !fill ? seg.c : `${seg.c} ${fill}`.trim() }));
}

export function split(w, left, right) {
  const gap = Math.max(1, w - rowWidth(left) - rowWidth(right));
  return [...norm(left), s(' '.repeat(gap)), ...norm(right)];
}

export function hcat(columns) {
  const height = Math.max(...columns.map((c) => (c.rows ? c.rows.length : 0)));
  const out = [];
  for (let y = 0; y < height; y += 1) {
    out.push(columns.flatMap((c) => (c.rows ? fit(c.rows[y] ?? [], c.w, c.bg) : [s(c.sep, c.c ?? 'ln')])));
  }
  return out;
}

export function box(w, title, rows, border = 'ln', titleStyle = 'f0 B') {
  const label = truncate(title, Math.max(0, w - 5));
  const top = [s('╭─', border), s(` ${label} `, titleStyle), s(`${'─'.repeat(Math.max(0, w - width(label) - 5))}╮`, border)];
  const body = rows.map((row) => [s('│ ', border), ...fit(row, w - 4, '', true), s(' │', border)]);
  return [top, ...body, [s(`╰${'─'.repeat(w - 2)}╯`, border)]];
}

export function keys(items) {
  const out = [s(' ')];
  for (const [key, label] of items) out.push(s(` ${key} `, 'bg2 f0'), s(` ${label}   `, 'f1'));
  return out;
}

function sgr(style) {
  const codes = [];
  for (const name of style.split(/\s+/).filter(Boolean)) {
    if (name === 'B') codes.push('1');
    const fg = THEME.fg[name];
    const bg = THEME.bg[name];
    if (fg) codes.push(`38;2;${rgb(fg)}`);
    if (bg) codes.push(`48;2;${rgb(bg)}`);
  }
  return codes;
}

function rgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `${n >> 16};${(n >> 8) & 255};${n & 255}`;
}

const BASE = `\u001b[0;38;2;${rgb(THEME.fg.f0)};48;2;${rgb(THEME.bg.bg0)}`;

export function toAnsi(row) {
  return `${row.map((seg) => `${BASE}${sgr(seg.c).map((c) => `;${c}`).join('')}m${seg.t}`).join('')}\u001b[0m`;
}

export const toPlain = (row) => row.map((seg) => seg.t).join('');
