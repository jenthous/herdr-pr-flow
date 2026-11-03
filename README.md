# PR Flow

**English** | [한국어](README.ko.md)

A [Herdr](https://herdr.dev) plugin for the part of the job after your agent opens a pull request.

![PR Flow: a CI failure goes to the agent, the fixed PR comes back to you, and you merge from the terminal](docs/demo.gif)

*The plugin's real screens, drawn with sample data.*

PR Flow finds the PR each agent opened and sends CI failures and AI review comments back to that agent. It calls you when a decision is yours, and you verify and merge from the terminal.

The board sorts PRs by who they are waiting on, so it fits any repo. A repo with no CI or no AI review uses the same four columns:

| Column | Meaning |
| --- | --- |
| Agent working | An agent is working or fixing something |
| Waiting | Waiting for CI, AI review, or a reviewer |
| Your turn | You need to verify, decide, or unblock |
| Merged | Done in the last 24 hours |

A check that doesn't exist never counts as passed. The card says `no CI`, and the merge dialog warns you that nothing verified the PR.

## Status

Early release (0.1.0). The full flow has been run end to end on a test repo with real GitHub Actions and a real Claude Code agent, including auto-fix and merging. It hasn't had much everyday use yet, and other agents such as Codex haven't been tried. Start on a repo you can afford to experiment with, and turn auto-fix off with `a` until you trust it.

## Requirements

- Herdr 0.9.3 or later
- Node.js 20 or later
- [GitHub CLI](https://cli.github.com) logged in (`gh auth status`)

## Install

```sh
herdr plugin install jjangsky/herdr-pr-flow
herdr plugin action invoke open --plugin jjangsky.pr-flow
```

Bind a key in `~/.config/herdr/config.toml`:

```toml
[[keys.command]]
key = "prefix+p"
type = "plugin_action"
command = "jjangsky.pr-flow.open"
description = "PR Flow"
```

Ctrl+click a GitHub PR link in a terminal to open it in PR Flow.

## Keys

**Board:** arrows or `hjkl` move, `enter` opens a PR, `g` goes to the agent, `a` turns auto-fix on or off, `R` refreshes, `q` quits.

**Pull request:**

| Key | Action |
| --- | --- |
| `tab`, `1` `2` `3` | Overview, Diff, CI |
| `j` `k`, `[` `]` | Scroll, change file |
| `n` `p`, `y` | Select a review thread, resolve it |
| `c` | Reply to the selected thread, or comment on the PR |
| `f` | Tell the agent what to fix |
| `a` | Ask the agent to verify the PR |
| `l` | Run the repo's `run` command in this PR's checkout |
| `t` `T` | Check or uncheck the next test plan item |
| `r` | Rerun failed GitHub Actions jobs |
| `A`, `C` | Approve, request changes |
| `u`, `d`, `x` | Update branch, toggle draft, close |
| `z` | Let auto-fix try again after it stopped |
| `m` | Merge |
| `o` | Open on GitHub |

## Auto-fix

When a PR has a failed check or a new AI review comment, PR Flow sends it to the agent working on that branch. It only acts when all of these are true:

- You authored the PR, and it isn't a draft.
- The agent is idle. A working or blocked agent is never interrupted.
- The PR has used fewer than `max_fixes` attempts, and the same failure hasn't survived 3 fixes.

CI logs and review comments are marked as untrusted in the prompt, because anyone who can comment on a PR can write text your agent reads. Marking reduces this risk but can't remove it. Turn auto-fix off with `a` for any repo where people you don't trust can comment or change CI output.

Comments from people are never sent automatically, and PR Flow never merges on its own.

The auto-fix loop runs while a PR Flow pane is open. If you open a second pane, it is view-only.

## Merging

The merge dialog pins the commit shown when it opened. If the agent pushes during your check, GitHub refuses the merge and you review again. Your repo's branch rules still apply.

## Configuration

PR Flow works without configuration. To change it, edit `config.toml` in the directory printed by `herdr plugin config-dir jjangsky.pr-flow`:

```toml
auto_fix = true
max_fixes = 3
poll_seconds = 30
ci_wait = "2m"    # how long a new commit waits for checks before showing "no CI"
ai_wait = "10m"   # how long to wait in repos that usually get AI review

[repo."acme/shop"]
run = "pnpm dev"
ai_reviewers = ["my-review-bot"]
ai_checks = ["nightly reviewer"]
```

Settings are read only from this file and never from a repository, so a pull request can't change its own `run` command or reviewer list.

PR Flow recognizes common AI reviewers by login, and CI jobs such as `claude-review` by name. A failed AI review job is shown as unfinished and is not sent to the agent as a code failure. If your reviewer uses another name, add its login to `ai_reviewers` or its job name to `ai_checks`.

## Sidebar

PR Flow reports each agent's PR status as a `pr_flow` token. To show it, add `$pr_flow` to a row under `[ui.sidebar.agents]` in your Herdr config.

## Limits

- PRs are found through agents running in your Herdr session. Other PRs appear only when you open their link.
- Only CI that reports to GitHub is visible. Logs load for GitHub Actions; other CI shows a link.
- Whether an AI reviewer will run can't be known in advance. PR Flow estimates from recent merged PRs, then stops waiting after `ai_wait`.
- Comments are posted on the PR or on existing threads. Starting a new thread on a diff line isn't supported yet.
- Deployment after merge isn't tracked.

## Development

```sh
npm test
herdr plugin link "$PWD"
node bin/board.js --dump --plain --pr <url>   # read-only snapshot of a real PR
PR_FLOW_DRY_RUN=1 node bin/board.js           # interactive, sends and changes nothing
node scripts/demo-frames.js <dir>             # README demo frames as HTML
```
