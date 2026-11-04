import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDuration } from './text.js';

const DEFAULTS = { poll_seconds: 30, ci_wait: '2m', lang: '', ai_checks: [] };

function parseValue(raw, line) {
  const value = raw.trim();
  if (/^-?\d+$/.test(value)) return Number(value);
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Cannot read line ${line} of config.toml: ${value}`);
  }
}

// Cuts a trailing comment, leaving any # inside a quoted string alone.
function stripComment(raw) {
  let quoted = false;
  for (let i = 0; i < raw.length; i += 1) {
    if (quoted && raw[i] === '\\') i += 1;
    else if (raw[i] === '"') quoted = !quoted;
    else if (raw[i] === '#' && !quoted) return raw.slice(0, i);
  }
  return raw;
}

// Reads the small TOML subset the config needs: top-level `key = value` lines.
export function parseConfig(source) {
  const result = {};
  source.split('\n').forEach((line, index) => {
    const text = line.trim();
    if (!text || text.startsWith('#')) return;
    const pair = /^([a-z_]+)\s*=\s*(.+)$/.exec(text);
    if (!pair) throw new Error(`Cannot read line ${index + 1} of config.toml: ${text}`);
    result[pair[1]] = parseValue(stripComment(pair[2]), index + 1);
  });
  return result;
}

export function settingsFrom(values = {}, env = process.env) {
  const merged = { ...DEFAULTS, ...values };
  const locale = merged.lang || env.LC_ALL || env.LC_MESSAGES || env.LANG || '';
  return {
    pollMs: Math.max(10_000, Number(merged.poll_seconds) * 1000 || 30_000),
    ciWaitMs: parseDuration(merged.ci_wait, 120_000),
    aiChecks: (Array.isArray(merged.ai_checks) ? merged.ai_checks : []).map((x) => String(x).toLowerCase()),
    lang: /^ko/i.test(locale) ? 'ko' : 'en',
  };
}

export function loadSettings(configDir, env = process.env) {
  const path = configDir ? join(configDir, 'config.toml') : '';
  return settingsFrom(path && existsSync(path) ? parseConfig(readFileSync(path, 'utf8')) : {}, env);
}
