// Finds PRs from live agents and keeps their data fresh. It only reads: nothing is sent to
// agents or GitHub. Git, gh and herdr are injected so the loop can run against fakes in tests.

import { parsePrUrl } from './gh.js';
import { prState } from './status.js';
import { sanitize } from './text.js';

const AGENT_POLL_MS = 3_000;
const DISCOVER_MS = 30_000;
const SETTLED_FACTOR = 4;
const MERGED_KEEP_MS = 24 * 3_600_000;
const CONCURRENCY = 4;

export function createEngine({ gh, herdr, git, store, settings, now = Date.now }) {
  const tracked = store.data.tracked;
  const live = new Map(); // url -> { pr, threads, fetchedAt, error }
  const discovered = new Map(); // repo:branch -> at
  const previousStatus = new Map(); // pane id -> status
  let agents = [];
  let lastError = '';
  let lastSync = 0;
  const listeners = [];
  let timers = [];

  const emit = () => listeners.forEach((fn) => fn());
  const agentFor = (entry) => agents.find((a) => a.git?.repo === entry.repo && a.git?.branch === entry.branch) ?? null;

  function track(url, branch) {
    const parsed = parsePrUrl(url);
    if (!parsed) return null;
    const entry = (tracked[parsed.url] ??= { url: parsed.url, repo: parsed.repo, number: parsed.number, branch: '', headSha: '', headSeenAt: now() });
    if (branch) entry.branch = branch;
    return entry;
  }

  async function discover(agent) {
    const { repo, branch, root } = agent.git;
    if (Object.values(tracked).some((t) => t.repo === repo && t.branch === branch)) return;
    const key = `${repo}:${branch}`;
    if (now() - (discovered.get(key) ?? 0) < DISCOVER_MS) return;
    discovered.set(key, now());
    const url = await gh.discover(root, branch).catch(() => null);
    if (!url) return;
    const entry = track(url, branch);
    store.save();
    await refresh(entry.url);
  }

  async function pollAgents() {
    try {
      const list = await herdr.listAgents();
      agents = await Promise.all(list.map(async (a) => ({ ...a, git: await git.describe(a.foreground_cwd || a.cwd) })));
      await Promise.all(agents.filter((a) => a.git?.repo && a.git.branch).map(discover));
      // An agent that just finished has probably pushed, so look now instead of at the next poll.
      const finished = agents.filter((a) => previousStatus.get(a.pane_id) === 'working' && a.agent_status !== 'working');
      for (const a of agents) previousStatus.set(a.pane_id, a.agent_status);
      await Promise.all(Object.values(tracked).filter((t) => finished.some((a) => a.git?.repo === t.repo && a.git?.branch === t.branch)).map((t) => refresh(t.url)));
      if (lastError.startsWith('herdr')) lastError = '';
    } catch (error) {
      lastError = `herdr: ${error.message}`;
    }
    emit();
  }

  async function refresh(url) {
    const entry = tracked[url];
    if (!entry) return;
    try {
      const [pr, extra] = await Promise.all([gh.fetchPr(url), gh.fetchThreads(url)]);
      if (pr.headRefOid !== entry.headSha) {
        entry.headSha = pr.headRefOid;
        // A PR first seen long after its last commit should not wait for CI to appear.
        const committed = extra.headCommittedAt ? Date.parse(extra.headCommittedAt) : now();
        entry.headSeenAt = Math.min(committed, now());
      }
      entry.branch ||= pr.headRefName;
      live.set(url, { pr, threads: extra.threads, fetchedAt: now() });
      lastSync = now();
      if (lastError.startsWith('gh')) lastError = '';
      prune();
    } catch (error) {
      lastError = `gh: ${error.message}`;
      live.set(url, { ...live.get(url), error: error.message, fetchedAt: now() });
    }
    store.save();
    emit();
  }

  async function pollPrs() {
    const due = Object.values(tracked).filter((entry) => {
      const data = live.get(entry.url);
      if (!data) return true;
      if (['MERGED', 'CLOSED'].includes(data.pr?.state)) return false;
      return now() - data.fetchedAt >= settings.pollMs * (agentFor(entry) ? 1 : SETTLED_FACTOR);
    });
    for (let i = 0; i < due.length; i += CONCURRENCY) await Promise.all(due.slice(i, i + CONCURRENCY).map((e) => refresh(e.url)));
  }

  function prune() {
    for (const entry of Object.values(tracked)) {
      const pr = live.get(entry.url)?.pr;
      if (!pr) continue;
      const mergedAt = pr.mergedAt ? Date.parse(pr.mergedAt) : 0;
      if (pr.state === 'CLOSED' || (pr.state === 'MERGED' && now() - mergedAt > MERGED_KEEP_MS)) {
        delete tracked[entry.url];
        live.delete(entry.url);
      }
    }
  }

  // Open PRs by latest activity, then merged ones.
  function cards() {
    const out = [];
    for (const entry of Object.values(tracked)) {
      const data = live.get(entry.url);
      const agent = agentFor(entry);
      if (!data?.pr) {
        out.push({ key: entry.url, url: entry.url, repo: entry.repo, number: entry.number, loading: true, error: data?.error, agent });
        continue;
      }
      const status = prState(data.pr, { now: now(), headSeenAt: entry.headSeenAt, threads: data.threads }, settings);
      // A default title such as "Claude Code" says nothing about the work.
      const title = sanitize(agent?.terminal_title_stripped ?? '');
      const activity = /^(claude code|codex)$/i.test(title.trim()) ? '' : title;
      out.push({ key: entry.url, url: entry.url, repo: entry.repo, number: entry.number, pr: data.pr, status, agent, activity });
    }
    const rank = (c) => (c.pr?.state === 'MERGED' ? 1 : 0);
    const time = (c) => Date.parse(c.pr?.updatedAt ?? 0) || 0;
    return out.sort((a, b) => rank(a) - rank(b) || time(b) - time(a));
  }

  return {
    subscribe: (fn) => listeners.push(fn),
    async start() {
      await pollAgents();
      await pollPrs();
      timers = [setInterval(pollAgents, AGENT_POLL_MS), setInterval(pollPrs, 5_000)];
    },
    stop() {
      timers.forEach(clearInterval);
      store.save();
    },
    pollAgents,
    pollPrs,
    refresh,
    track,
    cards,
    status: () => ({ lastError, lastSync }),
  };
}
