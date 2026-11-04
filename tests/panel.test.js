import test from 'node:test';
import assert from 'node:assert/strict';
import { shrinkAmount, targetPane } from '../src/panel.js';

test('targetPane prefers the pane id, then the plugin context', () => {
  assert.equal(targetPane({ HERDR_PANE_ID: 'w:p1', HERDR_PLUGIN_CONTEXT_JSON: '{"focused_pane_id":"w:p2"}' }), 'w:p1');
  assert.equal(targetPane({ HERDR_PLUGIN_CONTEXT_JSON: '{"focused_pane_id":"w:p2"}' }), 'w:p2');
  assert.equal(targetPane({ HERDR_PLUGIN_CONTEXT_JSON: 'not json' }), '');
  assert.equal(targetPane({}), '');
});

test('shrinkAmount matches how herdr moved the split when measured', () => {
  // Measured in a 120 column tab: a 0.1 step moved the border by 12 columns.
  assert.equal(shrinkAmount(60, 120, 48), 0.1);
  assert.equal(shrinkAmount(60, 120), 0.133);
});

test('shrinkAmount leaves narrow panels alone', () => {
  assert.equal(shrinkAmount(40, 80), 0);
  assert.equal(shrinkAmount(44, 88), 0);
  assert.equal(shrinkAmount(60, 0), 0);
});
