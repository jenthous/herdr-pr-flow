import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanRunLog, gh, parsePrUrl, parseRemote, runIdFromUrl } from '../src/gh.js';

test('the GitHub client has no method that writes', () => {
  assert.deepEqual(Object.keys(gh).sort(), ['discover', 'failedLog', 'fetchDiff', 'fetchPr', 'fetchThreads', 'openInBrowser']);
});

test('cleanRunLog removes the job, step and timestamp prefix and group markers', () => {
  const raw = 'unit\tRun npm test\t2026-11-03T07:55:53.6922312Z ##[group]Run npm test\nunit\tRun npm test\t2026-11-03T07:55:53.8Z not ok 2 - failure\nunit\tRun npm test\t2026-11-03T07:55:53.9Z ##[endgroup]\nplain line';
  assert.equal(cleanRunLog(raw), 'not ok 2 - failure\nplain line');
});

test('parsePrUrl accepts PR links, with or without a trailing path', () => {
  assert.equal(parsePrUrl('https://github.com/a/b/pull/7/files').url, 'https://github.com/a/b/pull/7');
  assert.equal(parsePrUrl('https://example.com/a/b/pull/7'), null);
});

test('parseRemote reads HTTPS and SSH remotes and rejects other hosts', () => {
  assert.equal(parseRemote('https://github.com/a/b.git'), 'a/b');
  assert.equal(parseRemote('git@github.com:a/b.git'), 'a/b');
  assert.equal(parseRemote('https://gitlab.com/a/b.git'), null);
});

test('runIdFromUrl reads Actions links only', () => {
  assert.equal(runIdFromUrl('https://github.com/a/b/actions/runs/99/job/1'), '99');
  assert.equal(runIdFromUrl('https://ci.example.com/build/1'), null);
});

test('discover looks for open PRs only', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'pr-flow-gh-'));
  const path = process.env.PATH;
  t.after(() => {
    process.env.PATH = path;
    rmSync(dir, { recursive: true, force: true });
  });
  writeFileSync(join(dir, 'gh'), `#!/bin/sh\nprintf '%s ' "$@" > "${dir}/args"\nprintf '[]'\n`);
  chmodSync(join(dir, 'gh'), 0o755);
  process.env.PATH = `${dir}:${path}`;
  assert.equal(await gh.discover(dir, 'feature'), null);
  assert.match(readFileSync(join(dir, 'args'), 'utf8'), /--head feature --state open /);
});
