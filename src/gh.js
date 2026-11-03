import { execFile } from 'node:child_process';

const PR_FIELDS = [
  'number', 'title', 'body', 'url', 'state', 'isDraft', 'author', 'headRefName', 'headRefOid', 'baseRefName',
  'statusCheckRollup', 'reviewDecision', 'reviewRequests', 'latestReviews', 'mergeStateStatus', 'mergeable',
  'additions', 'deletions', 'changedFiles', 'mergedAt', 'updatedAt',
].join(',');

const THREADS_QUERY = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){
  reviewThreads(first:100){nodes{id isResolved isOutdated path line comments(first:30){nodes{id body createdAt author{login}}}}}
  comments(last:50){nodes{id body createdAt author{login}}}
  commits(last:1){nodes{commit{committedDate}}}
}}}`;

export function run(args, { cwd, timeout = 60_000, maxBuffer = 32 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    execFile('gh', args, { cwd, timeout, maxBuffer, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } }, (error, stdout, stderr) => {
      resolve({ ok: !error, code: error?.code ?? 0, stdout: String(stdout), stderr: String(stderr).trim() });
    });
  });
}

async function json(args, options) {
  const r = await run(args, options);
  if (!r.ok) throw new Error(r.stderr || `gh ${args[0]} failed`);
  return JSON.parse(r.stdout);
}

async function action(args, options) {
  const r = await run(args, options);
  if (!r.ok) throw new Error(r.stderr || `gh ${args[0]} failed`);
  return r.stdout;
}

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

export function runIdFromCheck(check) {
  const m = /\/actions\/runs\/(\d+)/.exec(check?.detailsUrl ?? check?.targetUrl ?? '');
  return m ? m[1] : null;
}

export const gh = {
  viewer: async () => (await json(['api', 'user'])).login,
  discover: async (cwd, branch) => {
    const list = await json(['pr', 'list', '--head', branch, '--state', 'all', '--limit', '1', '--json', 'url'], { cwd });
    return list[0]?.url ?? null;
  },
  fetchPr: (url) => json(['pr', 'view', url, '--json', PR_FIELDS]),
  fetchConversation: async (url) => {
    const p = parsePrUrl(url);
    const data = await json(['api', 'graphql', '-f', `query=${THREADS_QUERY}`, '-F', `owner=${p.owner}`, '-F', `name=${p.name}`, '-F', `number=${p.number}`]);
    const pull = data.data.repository.pullRequest;
    return {
      threads: pull.reviewThreads.nodes.map((t) => ({ ...t, comments: t.comments.nodes })),
      comments: pull.comments.nodes,
      headCommittedAt: pull.commits.nodes[0]?.commit.committedDate ?? null,
    };
  },
  fetchDiff: (url) => action(['pr', 'diff', url, '--color', 'never'], { timeout: 120_000 }),
  repoInfo: (repo) => json(['repo', 'view', repo, '--json', 'defaultBranchRef,squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed,viewerDefaultMergeMethod']),
  recentReviewers: async (repo) => {
    const list = await json(['pr', 'list', '-R', repo, '--state', 'merged', '--limit', '10', '--json', 'latestReviews']);
    return list.flatMap((pr) => pr.latestReviews.map((r) => r.author));
  },
  failedLog: async (repo, runId) => cleanRunLog(await action(['run', 'view', runId, '-R', repo, '--log-failed'], { timeout: 120_000 })),
  rerunFailed: (repo, runId) => action(['run', 'rerun', runId, '-R', repo, '--failed']),
  merge: (url, method, sha) => action(['pr', 'merge', url, `--${method}`, '--match-head-commit', sha]),
  comment: (url, body) => action(['pr', 'comment', url, '--body', body]),
  replyThread: (threadId, body) => action(['api', 'graphql', '-f', 'query=mutation($id:ID!,$body:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){comment{id}}}', '-F', `id=${threadId}`, '-f', `body=${body}`]),
  resolveThread: (threadId) => action(['api', 'graphql', '-f', 'query=mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id}}}', '-F', `id=${threadId}`]),
  approve: (url) => action(['pr', 'review', url, '--approve']),
  requestChanges: (url, body) => action(['pr', 'review', url, '--request-changes', '--body', body]),
  updateBranch: (url) => action(['pr', 'update-branch', url]),
  markReady: (url) => action(['pr', 'ready', url]),
  markDraft: (url) => action(['pr', 'ready', url, '--undo']),
  close: (url) => action(['pr', 'close', url]),
  openInBrowser: (url) => action(['pr', 'view', url, '--web']),
};
