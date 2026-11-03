import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, settingsFor } from '../src/config.js';

test('defaults apply with an empty config', () => {
  const s = settingsFor(parseConfig(''), 'acme/shop');
  assert.equal(s.autoFix, true);
  assert.equal(s.maxFixes, 3);
  assert.equal(s.ciWaitMs, 120000);
  assert.equal(s.aiWaitMs, 600000);
  assert.deepEqual(s.aiReviewers, []);
});

test('repo sections override global values, case-insensitively', () => {
  const config = parseConfig(`
# comment
auto_fix = false
ci_wait = "5m"

[repo."Acme/Shop"]
auto_fix = true
run = "pnpm dev"
ai_reviewers = ["CodeRabbitAI", "my-bot"]
`);
  const repo = settingsFor(config, 'acme/shop');
  assert.equal(repo.autoFix, true);
  assert.equal(repo.run, 'pnpm dev');
  assert.equal(repo.ciWaitMs, 300000);
  assert.deepEqual(repo.aiReviewers, ['coderabbitai', 'my-bot']);
  assert.equal(settingsFor(config, 'acme/other').autoFix, false);
});

test('malformed lines report where the problem is', () => {
  assert.throws(() => parseConfig('nonsense line'), /line 1/);
  assert.throws(() => parseConfig('a = maybe'), /line 1/);
});

test('poll interval cannot go below the rate-limit floor', () => {
  assert.equal(settingsFor(parseConfig('poll_seconds = 1'), 'a/b').pollMs, 10000);
});
