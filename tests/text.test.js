import test from 'node:test';
import assert from 'node:assert/strict';
import { ago, parseDuration, sanitize, truncate, width, wrap } from '../src/text.js';

test('sanitize removes terminal escape sequences from remote text', () => {
  assert.equal(sanitize('a\u001b[31mred\u001b[0m'), 'ared');
  assert.equal(sanitize('x\u001b]0;evil title\u0007y'), 'xy');
  assert.equal(sanitize('x\u001b]52;c;ZXZpbA==\u001b\\y'), 'xy');
  assert.equal(sanitize('a\u0007b\u0000c'), 'abc');
  assert.equal(sanitize('safe‮gnp'), 'safegnp');
});

test('sanitize keeps newlines and expands tabs', () => {
  assert.equal(sanitize('a\r\nb\tc'), 'a\nb    c');
});

test('width counts Korean and CJK as two cells', () => {
  assert.equal(width('abc'), 3);
  assert.equal(width('쿠폰'), 4);
  assert.equal(width('a쿠b'), 4);
  assert.equal(width('●━✓'), 3);
});

test('truncate never exceeds the cell limit on a wide character', () => {
  assert.equal(truncate('쿠폰수정', 5), '쿠폰');
  assert.equal(width(truncate('쿠폰수정', 5)), 4);
  assert.equal(truncate('abcdef', 4, true), 'abc…');
  assert.equal(truncate('abc', 4, true), 'abc');
  assert.equal(truncate('abc', 0), '');
});

test('wrap splits by cell width and keeps blank lines', () => {
  assert.deepEqual(wrap('abcd', 2), ['ab', 'cd']);
  assert.deepEqual(wrap('쿠폰수', 4), ['쿠폰', '수']);
  assert.deepEqual(wrap('a\n\nb', 5), ['a', '', 'b']);
});

test('wrap breaks at spaces and never exceeds the limit', () => {
  assert.deepEqual(wrap('hello big world', 9), ['hello big', 'world']);
  assert.deepEqual(wrap('쿠폰 할인 금액', 9), ['쿠폰 할인', '금액']);
  for (const line of wrap('쿠폰 할인 금액 반올림 averyveryverylongword 오류 수정'.repeat(4), 11)) {
    assert.ok(width(line) <= 11, line);
  }
});

test('parseDuration reads units and falls back on bad input', () => {
  assert.equal(parseDuration('2m', 1), 120000);
  assert.equal(parseDuration('30s', 1), 30000);
  assert.equal(parseDuration(5, 1), 5000);
  assert.equal(parseDuration('soon', 7), 7);
});

test('ago formats elapsed time', () => {
  assert.equal(ago(5000), '5s');
  assert.equal(ago(120000), '2m');
  assert.equal(ago(7200000), '2h');
});
