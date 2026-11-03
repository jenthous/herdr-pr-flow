import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function createStore(dir) {
  const path = dir ? join(dir, 'state.json') : '';
  let data = { tracked: {}, autoFixEnabled: true };
  if (path && existsSync(path)) {
    try {
      data = { ...data, ...JSON.parse(readFileSync(path, 'utf8')) };
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

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

// Only one board may send prompts and notifications. Other boards stay view-only.
export function acquireLock(dir) {
  if (!dir) return { held: true, release() {} };
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'engine.lock');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(path, String(process.pid), { flag: 'wx' });
      return {
        held: true,
        release() {
          try {
            unlinkSync(path);
          } catch {
            /* already gone */
          }
        },
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = Number(readFileSync(path, 'utf8'));
      if (owner && alive(owner)) return { held: false, release() {} };
      unlinkSync(path);
    }
  }
  return { held: false, release() {} };
}
