// Pure decision logic. Columns describe who a PR is waiting on, never a fixed pipeline,
// so a repo without CI or AI review fits the same board. A missing check is reported
// as missing and never counts as passed.

export const COLUMNS = ['agent', 'waiting', 'you', 'merged'];

const KNOWN_AI = new Set([
  'copilot-pull-request-reviewer',
  'copilot',
  'coderabbitai',
  'cursor',
  'greptile-apps',
  'sourcery-ai',
  'qodo-merge-pro',
  'claude',
]);

const SEND_GRACE_MS = 30_000;

const FAILED_CONCLUSIONS = new Set(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE']);
const FAILED_STATES = new Set(['FAILURE', 'ERROR']);

export function isAiAuthor(author, settings) {
  const login = String(author?.login ?? author?.name ?? '').toLowerCase();
  if (!login) return false;
  const bare = login.replace(/\[bot\]$/, '');
  if (settings.aiReviewers.includes(login) || settings.aiReviewers.includes(bare)) return true;
  return KNOWN_AI.has(bare);
}

export function checkState(check) {
  if (check.__typename === 'StatusContext' || check.state) {
    if (FAILED_STATES.has(check.state)) return 'failed';
    return check.state === 'SUCCESS' ? 'passed' : 'pending';
  }
  if (check.status !== 'COMPLETED') return 'pending';
  return FAILED_CONCLUSIONS.has(check.conclusion) ? 'failed' : 'passed';
}

// Many repos run AI review as a CI job. Its failure says nothing about the code,
// so it must not be reported as a CI failure or sent to the agent as one.
const AI_CHECK = /(claude|copilot|coderabbit|codex|gemini|cursor|greptile|\bai\b)[-_ /]*(code[-_ ]*)?review|review[-_ /]*(claude|copilot|codex|gemini|\bai\b)/i;

export function isAiCheck(check, settings) {
  const name = String(check.name ?? check.context ?? '').toLowerCase();
  return AI_CHECK.test(name) || settings.aiChecks.includes(name);
}

export function summarizeCi(pr, ctx, settings) {
  const all = pr.statusCheckRollup ?? [];
  const checks = all.filter((c) => !isAiCheck(c, settings));
  if (checks.length === 0) {
    const waited = ctx.now - ctx.headSeenAt;
    return waited < settings.ciWaitMs
      ? { kind: 'starting', total: 0, passed: 0, failed: [], text: 'CI ...' }
      : { kind: 'none', total: 0, passed: 0, failed: [], text: 'no CI' };
  }
  const states = checks.map((c) => ({ name: c.name ?? c.context ?? 'check', state: checkState(c), check: c }));
  const failed = states.filter((c) => c.state === 'failed');
  const passed = states.filter((c) => c.state === 'passed').length;
  const pending = states.some((c) => c.state === 'pending');
  const kind = failed.length ? 'failed' : pending ? 'pending' : 'passed';
  return { kind, total: states.length, passed, failed, text: `CI ${passed}/${states.length}` };
}

export function summarizeAi(pr, ctx, settings) {
  const threads = ctx.threads ?? [];
  const reviewers = (pr.latestReviews ?? []).filter((r) => isAiAuthor(r.author, settings));
  const aiThreads = threads.filter((t) => isAiAuthor(t.comments[0]?.author, settings));
  const open = aiThreads.filter((t) => !t.isResolved && !t.isOutdated);
  const requested = (pr.reviewRequests ?? []).some((r) => isAiAuthor(r, settings));
  const aiChecks = (pr.statusCheckRollup ?? []).filter((c) => isAiCheck(c, settings)).map(checkState);

  if (open.length) return { kind: 'comments', open, text: `AI ${open.length} open` };
  if (requested || aiChecks.includes('pending')) return { kind: 'pending', open, text: 'AI ...' };
  if (aiChecks.includes('failed')) return { kind: 'failed', open, text: 'AI failed' };
  if (reviewers.length || aiThreads.length || aiChecks.length) return { kind: 'done', open, text: 'AI ok' };
  if (ctx.expectsAi && ctx.now - ctx.headSeenAt < settings.aiWaitMs) return { kind: 'pending', open, text: 'AI ...' };
  return { kind: 'none', open, text: 'no AI' };
}

function humanComments(ctx, settings) {
  return (ctx.threads ?? []).filter(
    (t) => !t.isResolved && !t.isOutdated && t.comments[0] && !isAiAuthor(t.comments[0].author, settings),
  );
}

export function classify(pr, ctx, settings) {
  const ci = summarizeCi(pr, ctx, settings);
  const ai = summarizeAi(pr, ctx, settings);
  const humanThreads = humanComments(ctx, settings);
  const state = String(pr.state ?? 'OPEN').toUpperCase();
  const base = { ci, ai, humanThreads, autoStopped: ctx.autoStopped ?? null };
  const place = (column, tone, headline) => ({ ...base, column, tone, headline });

  if (state === 'MERGED') return place('merged', 'merged', 'merged');
  if (state === 'CLOSED') return place('closed', 'dim', 'closed');

  const status = ctx.agent?.agent_status;
  if (status === 'blocked') return place('you', 'bad', 'agent needs your input');
  if (status === 'working') return place('agent', 'info', ctx.activity || 'agent is working');
  if (pr.isDraft) return place('you', 'dim', 'draft');

  if (ctx.autoStopped) return place('you', 'bad', ctx.autoStopped);
  if (pr.reviewDecision === 'CHANGES_REQUESTED') return place('you', 'bad', 'changes requested');
  if (humanThreads.length) return place('you', 'warn', `${humanThreads.length} open comment${humanThreads.length > 1 ? 's' : ''}`);
  if (pr.mergeable === 'CONFLICTING') return place('you', 'bad', 'merge conflict');
  // Once a failure has been sent, the agent gets a moment to start. If it then stops with no
  // new commit, it gave up or asked a question, and only a person can move the PR forward.
  const fix = ctx.fix ?? {};
  const justSent = ctx.now - (fix.lastSentAt ?? 0) < SEND_GRACE_MS;
  const canFix = ctx.autoFix && ctx.agent;
  if (ci.kind === 'failed') {
    const signature = ci.failed.map((f) => f.name).sort().join('|');
    const sent = fix.sentCi?.[`${pr.headRefOid}:${signature}`];
    if (!canFix) return place('you', 'bad', `CI failed: ${ci.failed[0].name}`);
    if (!sent) return place('agent', 'warn', 'sending CI failure to agent');
    return justSent ? place('agent', 'warn', 'CI failure sent to agent') : place('you', 'bad', 'agent stopped, CI still failing');
  }
  if (ai.kind === 'comments') {
    const count = `${ai.open.length} AI comment${ai.open.length > 1 ? 's' : ''}`;
    const unsent = ai.open.some((t) => !fix.sentThreads?.includes(t.id));
    if (!canFix) return place('you', 'warn', `${count} open`);
    if (unsent) return place('agent', 'warn', 'sending AI review to agent');
    return justSent ? place('agent', 'warn', 'AI review sent to agent') : place('you', 'warn', `agent stopped, ${count} open`);
  }
  if (ci.kind === 'pending' || ci.kind === 'starting') return place('waiting', 'info', 'waiting for CI');
  if (ai.kind === 'pending') return place('waiting', 'info', 'waiting for AI review');
  if (ai.kind === 'failed') return place('you', 'warn', 'AI review did not finish');
  if (pr.reviewDecision === 'REVIEW_REQUIRED') return place('waiting', 'info', 'waiting for a reviewer');
  if (pr.mergeStateStatus === 'BEHIND') return place('you', 'warn', 'branch is behind base');
  if (pr.mergeStateStatus === 'BLOCKED') return place('you', 'warn', 'blocked by branch rules');

  if (ci.kind === 'none' && ai.kind === 'none') return place('you', 'warn', 'nothing checked this PR');
  return place('you', 'ok', 'ready to verify');
}

// Plain-language warnings shown at merge time for anything that did not actually verify the PR.
export function mergeWarnings(result, testPlan, pr = {}) {
  const warnings = [];
  if (pr.mergeable === 'CONFLICTING') warnings.push('This branch has merge conflicts.');
  if (pr.reviewDecision === 'REVIEW_REQUIRED') warnings.push('A reviewer is still required.');
  if (pr.reviewDecision === 'CHANGES_REQUESTED') warnings.push('A reviewer requested changes.');
  if (pr.mergeStateStatus === 'BLOCKED') warnings.push('Branch rules are blocking this merge.');
  if (pr.mergeStateStatus === 'BEHIND') warnings.push('This branch is behind its base.');
  if (pr.isDraft) warnings.push('This PR is a draft.');
  if (result.ci.kind === 'none') warnings.push('No CI ran on this PR.');
  if (result.ci.kind === 'failed') warnings.push(`CI failed: ${result.ci.failed.map((f) => f.name).join(', ')}.`);
  if (result.ci.kind === 'pending' || result.ci.kind === 'starting') warnings.push('CI is still running.');
  if (result.ai.kind === 'none') warnings.push('No AI review on this PR.');
  if (result.ai.kind === 'failed') warnings.push('AI review did not finish.');
  if (result.ai.kind === 'pending') warnings.push('AI review is still running.');
  if (result.ai.kind === 'comments') warnings.push(`${result.ai.open.length} AI comment(s) still open.`);
  if (result.humanThreads.length) warnings.push(`${result.humanThreads.length} review comment(s) still open.`);
  if (testPlan.total > testPlan.checked) warnings.push(`Test plan ${testPlan.checked}/${testPlan.total} checked.`);
  return warnings;
}

export function stripHtmlComments(text) {
  return String(text ?? '').replace(/<!--[\s\S]*?(-->|$)/g, '');
}

const PLAN_HEADING = /test|qa\b|verif|how to check|테스트|검증|확인/i;

// Only lists under a heading such as "Test plan" count. PR templates also use checkboxes
// for things like authorship declarations, and those are not tests to perform.
export function parseTestPlan(body) {
  const items = [];
  let inPlan = false;
  for (const line of stripHtmlComments(body).split('\n')) {
    const heading = /^\s*(?:#{1,6}\s+(.+)|\*\*(.+?)\*\*:?\s*)$/.exec(line);
    if (heading) {
      inPlan = PLAN_HEADING.test(heading[1] ?? heading[2]);
      continue;
    }
    if (!inPlan) continue;
    const item = /^\s*[-*]\s+(?:\[[ xX]\]\s+)?(.+)$/.exec(line);
    if (item) items.push(item[1].trim());
  }
  return items;
}
