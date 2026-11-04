import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, settingsFrom } from '../src/config.js';

test('defaults apply with an empty config', () => {
  const s = settingsFrom({}, {});
  assert.equal(s.pollMs, 30000);
  assert.equal(s.ciWaitMs, 120000);
  assert.equal(s.lang, 'en');
});

test('reads values and comments', () => {
  const s = settingsFrom(parseConfig('# note\nci_wait = "5m"\nai_checks = ["My Bot"]\nlang = "ko"  # korean'), {});
  assert.equal(s.ciWaitMs, 300000);
  assert.deepEqual(s.aiChecks, ['my bot']);
  assert.equal(s.lang, 'ko');
});

test('a comment after a value may contain quotes and brackets', () => {
  const s = parseConfig('ci_wait = "2m"  # before showing "no CI"\nlang = "ko" # "en" or "ko"\nai_checks = ["a"] # see ["b"]');
  assert.deepEqual(s, { ci_wait: '2m', lang: 'ko', ai_checks: ['a'] });
});

test('a # inside a string is part of the value', () => {
  assert.deepEqual(parseConfig('ai_checks = ["review #1", "say \\"#2\\""] # note'), { ai_checks: ['review #1', 'say "#2"'] });
});

test('language follows the locale unless set', () => {
  assert.equal(settingsFrom({}, { LANG: 'ko_KR.UTF-8' }).lang, 'ko');
  assert.equal(settingsFrom({}, { LANG: 'en_US.UTF-8' }).lang, 'en');
  assert.equal(settingsFrom({ lang: 'en' }, { LANG: 'ko_KR.UTF-8' }).lang, 'en');
});

test('malformed lines report where the problem is', () => {
  assert.throws(() => parseConfig('nonsense line'), /line 1/);
  assert.throws(() => parseConfig('a = maybe'), /line 1/);
});

test('poll interval cannot go below the rate-limit floor', () => {
  assert.equal(settingsFrom({ poll_seconds: 1 }, {}).pollMs, 10000);
});
