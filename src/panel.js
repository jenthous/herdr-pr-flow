// Where to open the side panel, and how far to shrink the half-width split herdr creates.
export const PANEL_WIDTH = 44;

export function targetPane(env) {
  if (env.HERDR_PANE_ID) return env.HERDR_PANE_ID;
  try {
    const context = JSON.parse(env.HERDR_PLUGIN_CONTEXT_JSON ?? '{}');
    return context.focused_pane_id ?? context.pane_id ?? context.pane?.pane_id ?? '';
  } catch {
    return '';
  }
}

// herdr resizes by a share of the parent split. Returns 0 when the panel should stay as it is.
export function shrinkAmount(panelWidth, splitWidth, desired = PANEL_WIDTH) {
  if (panelWidth <= desired || splitWidth <= 0) return 0;
  return Number(((panelWidth - desired) / splitWidth).toFixed(3));
}
