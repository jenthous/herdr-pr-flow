import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanRunLog, parsePrUrl, parseRemote, runIdFromCheck } from '../src/gh.js';

test('cleanRunLog removes the job, step and timestamp prefix and group markers', () => {
  const raw = 'unit\tRun npm test\t2026-11-03T07:55:53.6922312Z ##[group]Run npm test\nunit\tRun npm test\t2026-11-03T07:55:53.8Z not ok 2 - failure\nunit\tRun npm test\t2026-11-03T07:55:53.9Z ##[endgroup]\nplain line';
  assert.equal(cleanRunLog(raw), 'not ok 2 - failure\nplain line');
});

test('parsePrUrl accepts PR links, with or without a trailing path', () => {
  assert.equal(parsePrUrl('https://github.com/a/b/pull/7/files').url, 'https://github.com/a/b/pull/7');
  assert.equal(parsePrUrl('https://github.com/a/b/pull/7').repo, 'a/b');
  assert.equal(parsePrUrl('https://example.com/a/b/pull/7'), null);
  assert.equal(parsePrUrl('nonsense'), null);
});

test('parseRemote reads HTTPS and SSH remotes and rejects other hosts', () => {
  assert.equal(parseRemote('https://github.com/a/b.git'), 'a/b');
  assert.equal(parseRemote('git@github.com:a/b.git'), 'a/b');
  assert.equal(parseRemote('https://gitlab.com/a/b.git'), null);
});

test('runIdFromCheck reads Actions links only', () => {
  assert.equal(runIdFromCheck({ detailsUrl: 'https://github.com/a/b/actions/runs/99/job/1' }), '99');
  assert.equal(runIdFromCheck({ detailsUrl: 'https://ci.example.com/build/1' }), null);
});
