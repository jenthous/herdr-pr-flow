import { execFile } from 'node:child_process';

const BIN = process.env.HERDR_BIN_PATH || 'herdr';

function run(args, timeout = 15_000) {
  return new Promise((resolve, reject) => {
    execFile(BIN, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr).trim() || error.message));
      else resolve(String(stdout));
    });
  });
}

export const herdr = {
  listAgents: async () => JSON.parse(await run(['agent', 'list'])).result.agents,
  prompt: (paneId, text) => run(['agent', 'prompt', paneId, text]),
  focus: (paneId) => run(['agent', 'focus', paneId]),
  notify: (title, body) => run(['notification', 'show', title, '--body', body, '--position', 'bottom-right', '--sound', 'request']),
  reportToken: (paneId, source, value) =>
    run(['pane', 'report-metadata', paneId, '--source', source, ...(value ? ['--token', `pr_flow=${value}`] : ['--clear-token', 'pr_flow'])]),
  // Opens a shell below this pane in the PR's checkout and runs the configured command there.
  runBelow: async (cwd, command) => {
    const split = JSON.parse(await run(['pane', 'split', '--current', '--direction', 'down', '--cwd', cwd, '--no-focus']));
    const paneId = split.result?.pane?.pane_id ?? split.result?.pane_id;
    if (!paneId) throw new Error('herdr did not return the new pane.');
    await run(['pane', 'run', paneId, command]);
    return paneId;
  },
};
