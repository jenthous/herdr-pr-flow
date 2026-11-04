#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { shrinkAmount, targetPane } from '../src/panel.js';

const herdr = process.env.HERDR_BIN_PATH || 'herdr';
const run = (args) => JSON.parse(execFileSync(herdr, args, { encoding: 'utf8' }));

const target = targetPane(process.env);
// A side panel needs a pane to sit beside. Without one, open as a tab instead of failing.
const placement = target ? ['--placement', 'split', '--direction', 'right', '--target-pane', target] : ['--placement', 'tab'];
const opened = run(['plugin', 'pane', 'open', '--plugin', process.env.HERDR_PLUGIN_ID ?? 'jjangsky.pr-flow', '--entrypoint', 'board', ...placement, '--focus']);

if (target) {
  const paneId = opened.result.plugin_pane.pane.pane_id;
  try {
    // The first small step returns the layout, which gives the sizes for the real one.
    const { layout } = run(['pane', 'resize', '--pane', paneId, '--direction', 'right', '--amount', '0.001']).result.resize;
    const panel = layout.panes.find((p) => p.pane_id === paneId);
    const split = layout.splits.find((sp) => sp.rect.x <= panel.rect.x && sp.rect.x + sp.rect.width >= panel.rect.x + panel.rect.width);
    const amount = shrinkAmount(panel.rect.width, split?.rect.width ?? 0);
    if (amount > 0) run(['pane', 'resize', '--pane', paneId, '--direction', 'right', '--amount', String(amount)]);
  } catch {
    // A wider panel still works, so a failed resize should not stop it from opening.
  }
}
