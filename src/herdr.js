import { execFile } from 'node:child_process';

const BIN = process.env.HERDR_BIN_PATH || 'herdr';

function run(args) {
  return new Promise((resolve, reject) => {
    execFile(BIN, args, { timeout: 15_000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr).trim() || error.message));
      else resolve(String(stdout));
    });
  });
}

export const herdr = {
  listAgents: async () => JSON.parse(await run(['agent', 'list'])).result.agents,
  focus: (paneId) => run(['agent', 'focus', paneId]),
};
