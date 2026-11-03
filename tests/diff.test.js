import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDiff } from '../src/diff.js';

const SAMPLE = `diff --git a/a.go b/a.go
index 111..222 100644
--- a/a.go
+++ b/a.go
@@ -10,3 +10,4 @@ func x() {
 keep
-old
+new
+extra
 end
diff --git a/img.png b/img.png
Binary files a/img.png and b/img.png differ
diff --git a/old.txt b/renamed.txt
similarity index 100%
rename from old.txt
rename to renamed.txt
`;

test('parses files, counts and line numbers', () => {
  const files = parseDiff(SAMPLE);
  assert.deepEqual(files.map((f) => f.path), ['a.go', 'img.png', 'renamed.txt']);
  assert.equal(files[0].added, 2);
  assert.equal(files[0].removed, 1);
  const lines = files[0].lines;
  assert.equal(lines[0].kind, 'hunk');
  assert.deepEqual(lines[1], { kind: 'ctx', oldNo: 10, newNo: 10, text: 'keep' });
  assert.deepEqual(lines[2], { kind: 'del', oldNo: 11, text: 'old' });
  assert.deepEqual(lines[3], { kind: 'add', newNo: 11, text: 'new' });
  assert.deepEqual(lines[4], { kind: 'add', newNo: 12, text: 'extra' });
  assert.deepEqual(lines[5], { kind: 'ctx', oldNo: 12, newNo: 13, text: 'end' });
});

test('does not count the +++ and --- headers as changes', () => {
  assert.equal(parseDiff(SAMPLE)[0].lines.some((l) => l.text === '++ b/a.go'), false);
});

test('marks binary files and handles empty input', () => {
  assert.equal(parseDiff(SAMPLE)[1].lines[0].text, 'Binary file not shown.');
  assert.deepEqual(parseDiff(''), []);
});
