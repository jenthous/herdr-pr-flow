// Made-up GitHub and agents for the README's screens. Only the demo build imports this.
// The scene number comes from demo-step.txt, so a script can move the story on.
import { appHome, readTextFile, run as realRun } from "herdr";

const min = (n) => new Date(Date.now() - n * 60_000).toISOString();
const check = (name, status, conclusion, at = 12) => ({ __typename: "CheckRun", name, status, conclusion, completedAt: min(at), detailsUrl: `https://github.com/acme/x/actions/runs/9${name.length}/job/1` });
const step = (name, status, conclusion = null) => ({ name, status, conclusion });
const ok = (name) => step(name, "completed", "success");
const auto = (list) => [ok("Set up job"), ...list, step("Complete job", list.at(-1).status === "completed" ? "completed" : "pending", list.at(-1).status === "completed" ? "success" : null)];

const PAY = "https://github.com/acme/shop-api/pull/482", FILTER = "https://github.com/acme/admin-web/pull/1093", LOGIN = "https://github.com/acme/mobile/pull/318", LOG = "https://github.com/acme/notify/pull/77";
const BRANCHES = { "acme/shop-api:feat/payment-retry": PAY, "acme/admin-web:fix/list-filter": FILTER, "acme/mobile:fix/login-keyboard": LOGIN, "acme/notify:feat/delivery-log": LOG };
const base = { state: "OPEN", isDraft: false, baseRefName: "main", mergeable: "MERGEABLE", mergeStateStatus: "BLOCKED", latestReviews: [], reviewDecision: "", statusCheckRollup: [], headRefOid: "abc", body: "" };

function payment(s) {
  const pr = { ...base, url: PAY, number: 482, title: "Retry failed payments with backoff", headRefName: "feat/payment-retry", createdAt: min(190), updatedAt: min(0), additions: 16, deletions: 2, changedFiles: 3,
    body: "Closes #470\n\nFailed payments now go back on a queue and retry with backoff, up to five times.",
    files: [{ path: "src/payment/retry.go", additions: 14, deletions: 2 }, { path: "src/payment/queue.go", additions: 1, deletions: 0 }, { path: "src/payment/retry_test.go", additions: 1, deletions: 0 }] };
  const passed = ["build", "test", "lint", "security"].map((n) => check(n, "COMPLETED", "SUCCESS", 9));
  if (s === 0) return { ...pr, statusCheckRollup: [check("build", "COMPLETED", "SUCCESS", 2), check("lint", "COMPLETED", "SUCCESS", 2), check("test", "IN_PROGRESS", null), check("security", "IN_PROGRESS", null)] };
  const reviewed = { ...pr, statusCheckRollup: passed, reviewDecision: "APPROVED", latestReviews: [{ state: "APPROVED", author: { login: "dana" }, submittedAt: min(5) }], mergeStateStatus: "CLEAN" };
  if (s === 1) return reviewed;
  return { ...reviewed, state: "MERGED", mergedAt: min(s === 2 ? 0 : s === 3 ? 2 : 4), mergeCommit: { oid: "merge482" } };
}

const others = () => [
  { ...base, url: LOG, number: 77, title: "Add delivery log API", headRefName: "feat/delivery-log", createdAt: min(40), updatedAt: min(3), additions: 131, deletions: 4, changedFiles: 2, files: [{ path: "src/log/handler.go", additions: 96, deletions: 4 }, { path: "src/log/handler_test.go", additions: 35, deletions: 0 }],
    statusCheckRollup: [check("build", "COMPLETED", "SUCCESS", 5), { ...check("test", "COMPLETED", "FAILURE", 3), detailsUrl: "https://github.com/acme/notify/actions/runs/7701/job/1" }] },
  { ...base, url: FILTER, number: 1093, title: "Keep list filters after refresh", headRefName: "fix/list-filter", createdAt: min(200), updatedAt: min(6), additions: 86, deletions: 41, changedFiles: 2, files: [{ path: "src/pages/list.tsx", additions: 52, deletions: 30 }, { path: "src/hooks/useFilter.ts", additions: 34, deletions: 11 }],
    statusCheckRollup: [check("build", "COMPLETED", "SUCCESS"), check("test", "COMPLETED", "SUCCESS")], reviewDecision: "CHANGES_REQUESTED", latestReviews: [{ state: "CHANGES_REQUESTED", author: { login: "dana" }, submittedAt: min(6) }] },
  { ...base, url: LOGIN, number: 318, title: "Fix keyboard overlap on login", headRefName: "fix/login-keyboard", createdAt: min(70), updatedAt: min(25), additions: 19, deletions: 7, changedFiles: 1, files: [{ path: "app/login.tsx", additions: 19, deletions: 7 }],
    statusCheckRollup: [check("build", "COMPLETED", "SUCCESS", 25)], reviewDecision: "REVIEW_REQUIRED" },
];

const EXTRA = {
  [PAY]: { threads: [], issues: [{ number: 470, title: "Failed payments are never retried", state: "OPEN", url: "https://github.com/acme/shop-api/issues/470" }] },
  [LOG]: { threads: [], issues: [{ number: 64, title: "Support needs to see delivery logs", state: "OPEN", url: "https://github.com/acme/notify/issues/64" }] },
  [LOGIN]: { threads: [], issues: [] },
  [FILTER]: { issues: [], threads: [{ isResolved: false, isOutdated: false, path: "src/pages/list.tsx", line: 48, comments: { nodes: [{ author: { login: "dana" }, body: "An empty query overwrites the default filter here." }] } }] },
};

function runs(s) {
  const at = min(0);
  if (s === 2) return [{ id: 11, name: "Deploy Production", status: "in_progress", conclusion: null, html_url: "https://github.com/acme/shop-api/actions/runs/11", updated_at: at }, { id: 12, name: "unit-tests", status: "in_progress", conclusion: null, html_url: "https://github.com/acme/shop-api/actions/runs/12", updated_at: at }];
  if (s === 3) return [{ id: 11, name: "Deploy Production", status: "in_progress", conclusion: null, html_url: "https://github.com/acme/shop-api/actions/runs/11", updated_at: at }, { id: 12, name: "unit-tests", status: "completed", conclusion: "success", html_url: "https://github.com/acme/shop-api/actions/runs/12", updated_at: min(1) }];
  return [{ id: 11, name: "Deploy Production", status: "completed", conclusion: "success", html_url: "https://github.com/acme/shop-api/actions/runs/11", updated_at: min(1) }, { id: 12, name: "unit-tests", status: "completed", conclusion: "success", html_url: "https://github.com/acme/shop-api/actions/runs/12", updated_at: min(3) }];
}

function jobs(id, s) {
  if (id === "12") return [{ id: 1, name: "test", status: s === 2 ? "in_progress" : "completed", conclusion: s === 2 ? null : "success", steps: s === 2 ? auto([ok("Install"), step("Run tests", "in_progress")]) : auto([ok("Install"), ok("Run tests")]) }];
  const names = ["Install dependencies", "Build", "Upload to S3", "Invalidate CDN", "Notify"];
  const doneCount = s === 2 ? 1 : s === 3 ? 2 : 5;
  const list = names.map((n, i) => (i < doneCount ? ok(n) : i === doneCount ? step(n, "in_progress") : step(n, "pending")));
  return [{ id: 2, name: "deploy", status: doneCount === 5 ? "completed" : "in_progress", conclusion: doneCount === 5 ? "success" : null, steps: auto(list) }];
}

const DIFF = `diff --git a/src/payment/retry.go b/src/payment/retry.go
--- a/src/payment/retry.go
+++ b/src/payment/retry.go
@@ -42,9 +42,16 @@ func (q *Queue) Enqueue(job Job) error {
     if job.Attempts >= maxAttempts {
         return ErrGiveUp
     }
-    q.items = append(q.items, job)
-    return nil
+    job.RunAt = q.clock.Now().Add(backoff(job.Attempts))
+
+    q.mu.Lock()
+    defer q.mu.Unlock()
+    q.items = append(q.items, job)
+    q.metrics.Retried.Inc()
+    return nil
 }

@@ -71,4 +78,10 @@ func (q *Queue) Next() *Job {
+func backoff(attempt int) time.Duration {
+    d := baseDelay << attempt
+    if d > maxDelay {
+        return maxDelay
+    }
+    return d
+}
diff --git a/src/payment/queue.go b/src/payment/queue.go
--- a/src/payment/queue.go
+++ b/src/payment/queue.go
@@ -1,2 +1,3 @@
 package payment
+// Queue holds jobs waiting to run.
diff --git a/src/payment/retry_test.go b/src/payment/retry_test.go
--- a/src/payment/retry_test.go
+++ b/src/payment/retry_test.go
@@ -1,2 +1,3 @@
 package payment
+// Tests for retry.
`;

const LOG_TEXT = ["--- FAIL: TestDeliveryLog (0.02s)", "    handler_test.go:58: status = 500, want 200", "FAIL", "FAIL    acme/notify/src/log    0.214s", "##[error]Process completed with exit code 1."].map((l) => `test\tRun tests\t2026-11-04T10:00:00.0000000Z ${l}`).join("\n");

const scene = async () => Number((await readTextFile(`${appHome()}/demo-step.txt`)) ?? 0);
const out = (value) => ({ code: 0, stdout: typeof value === "string" ? value : JSON.stringify(value), stderr: "" });

export async function exec(cmd, args = [], options = {}) {
  const s = await scene();
  if (cmd === "sh") return out("en_US");
  if (cmd === "git") return out(`https://github.com/acme/${String(options.cwd).split("/").pop()}.git`);
  if (cmd !== "gh") return out("");
  const [a, b] = args, joined = args.join(" ");
  if (a === "auth") return out("");
  if (a === "pr" && b === "list") return out(BRANCHES[`${args[args.indexOf("-R") + 1]}:${args[args.indexOf("--head") + 1]}`] ? [{ url: BRANCHES[`${args[args.indexOf("-R") + 1]}:${args[args.indexOf("--head") + 1]}`] }] : []);
  if (a === "pr" && b === "view") return out(args[2] === PAY ? payment(s) : others().find((p) => p.url === args[2]));
  if (a === "pr" && b === "diff") return out(DIFF);
  if (a === "run") return out(LOG_TEXT);
  if (a === "issue") return out({ number: 470, title: "Failed payments are never retried", state: "OPEN", stateReason: null, url: args[2], createdAt: min(600), author: { login: "sam" }, labels: [{ name: "bug" }, { name: "payments" }],
    body: "A card that fails once is never charged again, so the order stays unpaid.\n\n**Expected:** retry with backoff, up to five times.",
    comments: [{ author: { login: "dana" }, createdAt: min(300), body: "Support sees about ten of these a day." }] });
  if (a === "api" && b === "graphql") {
    const number = args[args.findIndex((x) => x.startsWith("number=")) ] ?? "";
    const url = Object.keys(EXTRA).find((u) => u.endsWith(`/${number.split("=")[1]}`));
    const extra = EXTRA[url] ?? { threads: [], issues: [] };
    return out({ data: { repository: { pullRequest: { reviewThreads: { nodes: extra.threads }, closingIssuesReferences: { nodes: extra.issues }, commits: { nodes: [{ commit: { committedDate: min(30) } }] } } } } });
  }
  if (a === "api" && /\/jobs/.test(joined)) return out({ jobs: jobs(/runs\/(\d+)/.exec(joined)[1], s) });
  if (a === "api" && /actions\/runs/.test(joined)) return out({ workflow_runs: runs(s) });
  return out("{}");
}

const AGENTS = [
  { address: "t1", status: "working", repo: "shop-api", branch: "feat/payment-retry", name: "Payments" },
  { address: "t2", status: "working", repo: "notify", branch: "feat/delivery-log", name: "Delivery log" },
  { address: "t3", status: "idle", repo: "admin-web", branch: "fix/list-filter", name: "Admin filters" },
  { address: "t4", status: "done", repo: "mobile", branch: "fix/login-keyboard", name: "Mobile login" },
];
export const agents = () => AGENTS.map((a) => ({ address: a.address, status: a.status, app: "claude-code", program: { name: a.address === "t3" ? "Codex" : "Claude Code" }, space: a.address, space_name: a.name, tab_name: "1" }));
export const panes = () => [...AGENTS.map((a) => ({ pane: `p${a.address}`, terminal: a.address, cwd: `/work/${a.repo}`, branch: a.branch })), { pane: "viewer", mod: "pr-flow" }];
export const spaces = () => [];
export const run = (name, args) => (name.startsWith("pane.") || name === "agent.focus" ? null : realRun(name, args));
