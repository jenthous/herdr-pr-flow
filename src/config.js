import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDuration } from './text.js';

export const DEFAULTS = Object.freeze({
  auto_fix: true,
  max_fixes: 3,
  poll_seconds: 30,
  ci_wait: '2m',
  ai_wait: '10m',
  ai_reviewers: [],
  ai_checks: [],
  run: '',
});

function parseValue(raw, where) {
  const v = raw.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (v.startsWith('"') || v.startsWith('[')) {
    try {
      return JSON.parse(v);
    } catch {
      throw new Error(`Cannot read the value at ${where}: ${v}`);
    }
  }
  throw new Error(`Cannot read the value at ${where}: ${v}`);
}

// Reads the small TOML subset the config needs: `key = value` and `[repo."owner/name"]`.
export function parseConfig(source) {
  const result = { global: {}, repos: {} };
  let section = result.global;
  source.split('\n').forEach((line, index) => {
    const text = line.trim();
    if (!text || text.startsWith('#')) return;
    const header = /^\[repo\."([^"]+)"\]$/.exec(text);
    if (header) {
      section = result.repos[header[1].toLowerCase()] ??= {};
      return;
    }
    const pair = /^([a-z_]+)\s*=\s*(.+)$/.exec(text);
    if (!pair) throw new Error(`Cannot read line ${index + 1} of config.toml: ${text}`);
    const value = pair[2].replace(/\s+#[^"\]]*$/, '');
    section[pair[1]] = parseValue(value, `line ${index + 1}`);
  });
  return result;
}

export function loadConfig(configDir) {
  const path = configDir ? join(configDir, 'config.toml') : '';
  if (!path || !existsSync(path)) return parseConfig('');
  return parseConfig(readFileSync(path, 'utf8'));
}

// Config comes only from the user's config directory, never from a checked-out repo.
// A pull request must not be able to change its own `run` command or reviewer allowlist.
export function settingsFor(config, repo) {
  const merged = { ...DEFAULTS, ...config.global, ...(config.repos[String(repo).toLowerCase()] ?? {}) };
  return {
    autoFix: merged.auto_fix === true,
    maxFixes: Math.max(0, Number(merged.max_fixes) || 0),
    pollMs: Math.max(10_000, Number(merged.poll_seconds) * 1000 || 30_000),
    ciWaitMs: parseDuration(merged.ci_wait, 120_000),
    aiWaitMs: parseDuration(merged.ai_wait, 600_000),
    aiReviewers: (Array.isArray(merged.ai_reviewers) ? merged.ai_reviewers : []).map((x) => String(x).toLowerCase()),
    aiChecks: (Array.isArray(merged.ai_checks) ? merged.ai_checks : []).map((x) => String(x).toLowerCase()),
    run: typeof merged.run === 'string' ? merged.run : '',
  };
}
