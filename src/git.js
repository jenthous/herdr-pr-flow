import { execFile } from 'node:child_process';
import { parseRemote } from './gh.js';

const TTL_MS = 10_000;
const cache = new Map();

function git(cwd, args) {
  return new Promise((resolve) => {
    execFile('git', ['-C', cwd, ...args], { timeout: 5_000 }, (error, stdout) => resolve(error ? '' : String(stdout).trim()));
  });
}

export const localGit = {
  async describe(cwd) {
    if (!cwd) return null;
    const hit = cache.get(cwd);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    const root = await git(cwd, ['rev-parse', '--show-toplevel']);
    let value = null;
    if (root) {
      const [branch, remote] = await Promise.all([git(cwd, ['branch', '--show-current']), git(cwd, ['remote', 'get-url', 'origin'])]);
      const repo = parseRemote(remote);
      if (repo) value = { root, branch, repo };
    }
    cache.set(cwd, { at: Date.now(), value });
    return value;
  },
};
