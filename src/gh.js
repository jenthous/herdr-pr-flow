import { execFile } from 'node:child_process';

// Every call here only reads. PR Flow never writes to GitHub.
const PR_FIELDS = [
  'number', 'title', 'url', 'state', 'isDraft', 'headRefName', 'headRefOid', 'baseRefName',
  'statusCheckRollup', 'reviewDecision', 'latestReviews', 'mergeStateStatus', 'mergeable',
  'additions', 'deletions', 'changedFiles', 'files', 'createdAt', 'mergedAt', 'updatedAt',
].join(',');

const THREADS_QUERY = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){
  reviewThreads(first:100){nodes{isResolved isOutdated}}
  commits(last:1){nodes{commit{committedDate}}}
}}}`;

function run(args, { cwd, timeout = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile('gh', args, { cwd, timeout, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr).trim() || `gh ${args[0]} failed`));
      else resolve(String(stdout));
    });
  });
}

const json = async (args, options) => JSON.parse(await run(args, options));

export function parsePrUrl(url) {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(String(url));
  return m ? { owner: m[1], name: m[2], repo: `${m[1]}/${m[2]}`, number: Number(m[3]), url: `https://github.com/${m[1]}/${m[2]}/pull/${m[3]}` } : null;
}

export function parseRemote(remote) {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(String(remote).trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

// `gh run view --log-failed` prefixes every line with job, step and timestamp.
export function cleanRunLog(log) {
  return String(log)
    .split('\n')
    .map((line) => line.replace(/^[^\t]*\t[^\t]*\t\d{4}-\d{2}-\d{2}T[\d:.]+Z ?/, ''))
    .filter((line) => !/^##\[(group|endgroup)\]/.test(line))
    .join('\n');
}

export function runIdFromUrl(url) {
  const m = /\/actions\/runs\/(\d+)/.exec(url ?? '');
  return m ? m[1] : null;
}

export const gh = {
  // Open PRs only: a closed PR is dropped from the list, so finding it again would repeat forever.
  discover: async (cwd, branch) => (await json(['pr', 'list', '--head', branch, '--state', 'open', '--limit', '1', '--json', 'url'], { cwd }))[0]?.url ?? null,
  fetchPr: (url) => json(['pr', 'view', url, '--json', PR_FIELDS]),
  fetchThreads: async (url) => {
    const p = parsePrUrl(url);
    const data = await json(['api', 'graphql', '-f', `query=${THREADS_QUERY}`, '-F', `owner=${p.owner}`, '-F', `name=${p.name}`, '-F', `number=${p.number}`]);
    const pull = data.data.repository.pullRequest;
    return { threads: pull.reviewThreads.nodes, headCommittedAt: pull.commits.nodes[0]?.commit.committedDate ?? null };
  },
  fetchDiff: (url) => run(['pr', 'diff', url, '--color', 'never'], { timeout: 120_000 }),
  failedLog: async (repo, runId) => cleanRunLog(await run(['run', 'view', runId, '-R', repo, '--log-failed'], { timeout: 120_000 })),
  openInBrowser: (url) => run(['pr', 'view', url, '--web']),
};
