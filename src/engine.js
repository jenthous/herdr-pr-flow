// Connects live agents to pull requests, keeps PR data fresh, and sends failures back.
// Git, gh and herdr are injected so the whole loop can run against fakes in tests.

import { aiPrompt, ciPrompt, decideFix, emptyFixState, recordSend } from './autofix.js';
import { classify, isAiAuthor } from './classify.js';
import { settingsFor } from './config.js';
import { parsePrUrl, runIdFromCheck } from './gh.js';
import { sanitize } from './text.js';

const AGENT_POLL_MS = 3_000;
const DISCOVER_MS = 30_000;
const SETTLED_POLL_FACTOR = 4;
const MERGED_KEEP_MS = 24 * 3_600_000;
const REPO_INFO_TTL = 3_600_000;
const CONCURRENCY = 4;

export function createEngine({ gh, herdr, git, store, config, canAct, dryRun = false, now = Date.now, log = () => {}, source = 'jjangsky.pr-flow' }) {
  const tracked = store.data.tracked;
  const live = new Map(); // url -> { pr, threads, comments, error, fetchedAt }
  const repoInfo = new Map(); // repo -> { at, defaultBranch, expectsAi, methods }
  const discovered = new Map(); // repo:branch -> at
  const previousStatus = new Map(); // pane id -> last agent status
  let agents = [];
  let viewer = '';
  let lastError = '';
  let lastSync = 0;
  let listeners = [];

  const emit = () => listeners.forEach((fn) => fn());
  const settingsOf = (repo) => settingsFor(config, repo);

  function ensureTracked(url, extra = {}) {
    const parsed = parsePrUrl(url);
    if (!parsed) return null;
    const entry = (tracked[parsed.url] ??= {
      url: parsed.url,
      repo: parsed.repo,
      number: parsed.number,
      cwd: '',
      branch: '',
      headSha: '',
      headSeenAt: now(),
      fix: emptyFixState(),
      checked: {},
      lastColumn: '',
      notifiedFor: '',
      addedAt: now(),
    });
    Object.assign(entry, extra);
    return entry;
  }

  async function info(repo) {
    const cached = repoInfo.get(repo);
    if (cached && now() - cached.at < REPO_INFO_TTL) return cached;
    const settings = settingsOf(repo);
    const [meta, reviewers] = await Promise.all([gh.repoInfo(repo), gh.recentReviewers(repo).catch(() => [])]);
    const methods = [
      meta.squashMergeAllowed && 'squash',
      meta.mergeCommitAllowed && 'merge',
      meta.rebaseMergeAllowed && 'rebase',
    ].filter(Boolean);
    const preferred = String(meta.viewerDefaultMergeMethod ?? '').toLowerCase();
    const value = {
      at: now(),
      defaultBranch: meta.defaultBranchRef?.name ?? '',
      expectsAi: reviewers.some((author) => isAiAuthor(author, settings)),
      methods,
      defaultMethod: methods.includes(preferred) ? preferred : methods[0] ?? 'squash',
    };
    repoInfo.set(repo, value);
    return value;
  }

  async function pollAgents() {
    try {
      const list = await herdr.listAgents();
      agents = await Promise.all(list.map(async (agent) => ({ ...agent, git: await git.describe(agent.foreground_cwd || agent.cwd) })));
      await Promise.all(agents.filter((a) => a.git?.repo && a.git.branch).map(discover));
      lastError = '';
      await refreshFinished();
    } catch (error) {
      lastError = `herdr: ${error.message}`;
    }
    emit();
  }

  // An agent that just finished has probably pushed. Look now instead of waiting for the next poll.
  async function refreshFinished() {
    const finished = agents.filter((a) => previousStatus.get(a.pane_id) === 'working' && a.agent_status !== 'working');
    for (const a of agents) previousStatus.set(a.pane_id, a.agent_status);
    const entries = finished.flatMap((a) => Object.values(tracked).filter((t) => t.repo === a.git?.repo && t.branch === a.git?.branch));
    await Promise.all(entries.map((entry) => refresh(entry.url)));
  }

  async function discover(agent) {
    const { repo, branch } = agent.git;
    const known = Object.values(tracked).find((t) => t.repo === repo && t.branch === branch);
    if (known) {
      known.cwd = agent.git.root;
      return;
    }
    const key = `${repo}:${branch}`;
    if (now() - (discovered.get(key) ?? 0) < DISCOVER_MS) return;
    discovered.set(key, now());
    const url = await gh.discover(agent.git.root, branch).catch(() => null);
    if (!url) return;
    ensureTracked(url, { branch, cwd: agent.git.root });
    store.save();
    await refresh(url);
  }

  const agentFor = (entry) => agents.find((a) => a.git?.repo === entry.repo && a.git?.branch === entry.branch) ?? null;

  async function refresh(url) {
    const entry = tracked[url];
    if (!entry) return;
    try {
      const [pr, conversation] = await Promise.all([gh.fetchPr(url), gh.fetchConversation(url)]);
      if (pr.headRefOid !== entry.headSha) {
        entry.headSha = pr.headRefOid;
        // A PR first seen long after its last commit should not wait for CI to appear.
        // Clamped to now so a skewed commit clock cannot extend the wait.
        const committed = conversation.headCommittedAt ? Date.parse(conversation.headCommittedAt) : now();
        entry.headSeenAt = Math.min(committed, now());
      }
      entry.branch ||= pr.headRefName;
      live.set(url, { pr, ...conversation, fetchedAt: now() });
      const repo = await info(entry.repo).catch(() => null);
      if (repo) live.get(url).repoInfo = repo;
      await act(entry);
      lastSync = now();
      lastError = '';
    } catch (error) {
      lastError = `gh: ${error.message}`;
      const current = live.get(url) ?? {};
      live.set(url, { ...current, error: error.message, fetchedAt: now() });
    }
    store.save();
    emit();
  }

  function resultFor(entry) {
    const data = live.get(entry.url);
    if (!data?.pr) return null;
    const settings = settingsOf(entry.repo);
    const agent = agentFor(entry);
    return classify(data.pr, {
      now: now(),
      headSeenAt: entry.headSeenAt,
      threads: data.threads,
      agent,
      activity: sanitize(agent?.terminal_title_stripped ?? ''),
      autoFix: settings.autoFix && store.data.autoFixEnabled !== false && data.pr.author?.login === viewer,
      autoStopped: entry.fix.stopped,
      fix: entry.fix,
      expectsAi: data.repoInfo?.expectsAi ?? false,
    }, settings);
  }

  async function act(entry) {
    const data = live.get(entry.url);
    const result = resultFor(entry);
    if (!result) return;
    if (canAct()) {
      const decision = decideFix({
        pr: data.pr,
        result,
        agent: agentFor(entry),
        fix: entry.fix,
        settings: settingsOf(entry.repo),
        viewer,
        enabled: store.data.autoFixEnabled !== false,
      });
      if (decision) await perform(entry, data, result, decision);
      await announce(entry, resultFor(entry));
    }
    entry.lastColumn = resultFor(entry).column;
  }

  async function perform(entry, data, result, decision) {
    if (decision.type === 'stop') {
      entry.fix = recordSend(entry.fix, decision, now());
      log(`#${entry.number} auto-fix stopped: ${decision.reason}`);
      return;
    }
    const prompt = decision.type === 'ci'
      ? ciPrompt(data.pr, result.ci, await logsFor(entry, result.ci))
      : aiPrompt(data.pr, decision.threads);
    const agent = agentFor(entry);
    if (dryRun) {
      log(`[dry-run] would send to ${agent.pane_id}:\n${prompt}`);
    } else {
      await herdr.prompt(agent.pane_id, prompt);
      log(`#${entry.number} sent ${decision.type} to ${agent.pane_id}`);
    }
    entry.fix = recordSend(entry.fix, decision, now());
  }

  async function logsFor(entry, ci) {
    const ids = [...new Set(ci.failed.map((f) => runIdFromCheck(f.check)).filter(Boolean))];
    if (!ids.length) return ci.failed.map((f) => `${f.name}: ${f.check?.detailsUrl ?? f.check?.targetUrl ?? 'no log link'}`).join('\n');
    const logs = await Promise.all(ids.map((id) => gh.failedLog(entry.repo, id).catch((e) => `Could not read run ${id}: ${e.message}`)));
    return logs.join('\n');
  }

  async function announce(entry, result) {
    const data = live.get(entry.url);
    const key = `${entry.headSha}:${result.column}:${result.headline}`;
    if (result.column === 'you' && entry.lastColumn !== 'you' && entry.notifiedFor !== key) {
      entry.notifiedFor = key;
      await herdr.notify(`PR #${entry.number}: ${sanitize(result.headline)}`, sanitize(data.pr.title)).catch(() => {});
    }
    const agent = agentFor(entry);
    if (agent) await herdr.reportToken(agent.pane_id, source, tokenFor(entry, result)).catch(() => {});
  }

  function tokenFor(entry, result) {
    if (result.column === 'merged' || result.column === 'closed') return '';
    return `#${entry.number} ${sanitize(result.headline)}`.slice(0, 40);
  }

  async function pollPrs() {
    const due = Object.values(tracked).filter((entry) => {
      const data = live.get(entry.url);
      const settings = settingsOf(entry.repo);
      if (!data) return true;
      const state = data.pr?.state;
      if (state === 'MERGED' || state === 'CLOSED') return false;
      const settled = !agentFor(entry);
      return now() - data.fetchedAt >= settings.pollMs * (settled ? SETTLED_POLL_FACTOR : 1);
    });
    for (let i = 0; i < due.length; i += CONCURRENCY) {
      await Promise.all(due.slice(i, i + CONCURRENCY).map((entry) => refresh(entry.url)));
    }
    pruneMerged();
  }

  function pruneMerged() {
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

  function cards() {
    const out = [];
    for (const entry of Object.values(tracked)) {
      const data = live.get(entry.url);
      if (!data?.pr) {
        out.push({ key: entry.url, url: entry.url, entry, loading: true, column: 'waiting', tone: 'dim', headline: data?.error ? 'could not load' : 'loading...', number: entry.number, repo: entry.repo });
        continue;
      }
      const result = resultFor(entry);
      if (result.column === 'closed') continue;
      out.push({ key: entry.url, url: entry.url, entry, data, result, column: result.column, tone: result.tone, headline: result.headline, number: entry.number, repo: entry.repo, agent: agentFor(entry) });
    }
    for (const agent of agents) {
      const { repo, branch } = agent.git ?? {};
      if (!repo || !branch) continue;
      if (Object.values(tracked).some((t) => t.repo === repo && t.branch === branch)) continue;
      const defaultBranch = repoInfo.get(repo)?.defaultBranch;
      if (!defaultBranch) info(repo).then(emit).catch(() => {});
      if (!defaultBranch || branch === defaultBranch) continue;
      const blocked = agent.agent_status === 'blocked';
      out.push({
        key: `agent:${agent.pane_id}`,
        noPr: true,
        column: blocked ? 'you' : 'agent',
        tone: blocked ? 'bad' : 'dim',
        headline: blocked ? 'agent needs your input' : sanitize(agent.terminal_title_stripped ?? '') || 'no PR yet',
        repo,
        branch,
        agent,
      });
    }
    return out;
  }

  let timers = [];
  return {
    subscribe(fn) {
      listeners.push(fn);
    },
    async start() {
      viewer = await gh.viewer();
      await pollAgents();
      await pollPrs();
      timers = [
        setInterval(pollAgents, AGENT_POLL_MS),
        setInterval(() => pollPrs().catch((e) => { lastError = `gh: ${e.message}`; emit(); }), 5_000),
      ];
    },
    stop() {
      timers.forEach(clearInterval);
      store.save();
    },
    pollAgents,
    pollPrs,
    refresh,
    cards,
    track: (url) => {
      const entry = ensureTracked(url);
      store.save();
      return entry;
    },
    resultFor,
    agentFor,
    settingsOf,
    live: (url) => live.get(url),
    logsFor,
    // Auto-fix needs both the board switch and the repo's setting, so report the effective value.
    status: (repo) => ({ viewer, lastError, lastSync, canAct: canAct(), autoFix: store.data.autoFixEnabled !== false && settingsOf(repo ?? '').autoFix, dryRun }),
    toggleAutoFix() {
      store.data.autoFixEnabled = store.data.autoFixEnabled === false;
      store.save();
      emit();
    },
    resetFix(url) {
      if (tracked[url]) tracked[url].fix = emptyFixState();
      store.save();
      emit();
    },
    save: () => store.save(),
  };
}
