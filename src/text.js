// Terminal text helpers. Everything from GitHub is untrusted: it must pass through
// sanitize() before reaching the screen, or a PR title could inject escape sequences.

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// CSI, OSC and other ESC sequences, then remaining C0/C1 controls except newline and tab.
const ANSI = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[@-Z\\-_])/g;
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
const BIDI = /[‪-‮⁦-⁩]/g;

export function sanitize(value) {
  return String(value ?? '')
    .replace(ANSI, '')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(BIDI, '')
    .replace(/\t/g, '    ')
    .normalize('NFC');
}

function isWide(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f680 && cp <= 0x1f6ff) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

function isZeroWidth(cp) {
  return (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    cp === 0xfeff
  );
}

function graphemeWidth(grapheme) {
  const cp = grapheme.codePointAt(0);
  if (isZeroWidth(cp)) return 0;
  return isWide(cp) ? 2 : 1;
}

export function width(text) {
  let total = 0;
  for (const { segment } of segmenter.segment(text)) total += graphemeWidth(segment);
  return total;
}

// Cut to at most `max` cells. A wide character that would straddle the edge is dropped.
export function truncate(text, max, ellipsis = false) {
  if (max <= 0) return '';
  if (width(text) <= max) return text;
  const limit = ellipsis ? max - 1 : max;
  let out = '';
  let used = 0;
  for (const { segment } of segmenter.segment(text)) {
    const w = graphemeWidth(segment);
    if (used + w > limit) break;
    out += segment;
    used += w;
  }
  return ellipsis ? `${out}…` : out;
}

export function wrap(text, max) {
  if (max <= 0) return [];
  const lines = [];
  for (const raw of sanitize(text).split('\n')) {
    let line = '';
    let used = 0;
    let breakAt = -1; // position just after the last space on this line
    for (const { segment } of segmenter.segment(raw)) {
      const w = graphemeWidth(segment);
      if (used + w > max) {
        if (breakAt > 0 && segment !== ' ') {
          lines.push(line.slice(0, breakAt).trimEnd());
          line = line.slice(breakAt);
        } else {
          lines.push(line.trimEnd());
          line = '';
        }
        used = width(line);
        breakAt = -1;
        if (segment === ' ') continue;
      }
      line += segment;
      used += w;
      if (segment === ' ') breakAt = line.length;
    }
    lines.push(line);
  }
  return lines;
}

export function parseDuration(value, fallbackMs) {
  if (typeof value === 'number' && Number.isFinite(value)) return value * 1000;
  const match = /^(\d+)\s*(ms|s|m|h)?$/.exec(String(value ?? '').trim());
  if (!match) return fallbackMs;
  const unit = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[match[2] ?? 's'];
  return Number(match[1]) * unit;
}

export function ago(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
