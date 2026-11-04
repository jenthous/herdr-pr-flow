import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Remembers which PRs were seen, so they stay listed after their agent exits.
export function createStore(dir) {
  const path = dir ? join(dir, 'tracked.json') : '';
  let data = { tracked: {} };
  if (path && existsSync(path)) {
    try {
      data = { tracked: {}, ...JSON.parse(readFileSync(path, 'utf8')) };
    } catch {
      renameSync(path, `${path}.bad`);
    }
  }
  return {
    data,
    save() {
      if (!path) return;
      mkdirSync(dir, { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(data));
      renameSync(tmp, path);
    },
  };
}
