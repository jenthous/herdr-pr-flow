# PR Flow

**English** | [한국어](README.ko.md)

![PR Flow: a PR list and a PR timeline in the Herdr side panel](docs/thumbnail.png)

A side panel for the [Herdr app](https://herdr.dev) that shows every pull request your agents opened and where each one is, from CI through to the workflows that run after a merge.

![PR Flow beside an agent: a PR goes from CI to merged, its deploy workflow runs step by step, then a linked issue and a diff open](docs/demo.gif)

*The real mod in the Herdr app, drawn with made-up projects and data.*

PR Flow only reads, unless you turn on the merge button (`merge`, off by default). It never sends anything to an agent. When something needs doing, jump to the agent and tell it there.

- **No setup.** A PR appears when an agent running in Herdr has one open on its branch.
- **Plain facts.** `No CI` and `No review` say so, and never count as passed.
- **After the merge too.** See which workflow is running and which step it's on, using the names in your own workflow files.
- **Linked issues.** Read the issue a PR closes without leaving the panel.

## Contents

- [Status](#status)
- [Requirements](#requirements)
- [Install](#install)
- [Using it](#using-it)
- [Reading the states](#reading-the-states)
- [How PRs are found and refreshed](#how-prs-are-found-and-refreshed)
- [Settings](#settings)
- [What it runs](#what-it-runs)
- [Troubleshooting](#troubleshooting)
- [Limits](#limits)
- [Development](#development)

## Status

Early release (0.3.0). It has been run on macOS with `herdr-app` 0.1.12 against real pull requests and real Claude Code agents. Codex, Linux, Windows and remote machines haven't been tried.

## Requirements

- The Herdr desktop app
- [GitHub CLI](https://cli.github.com), logged in (`gh auth status`)

## Install

Herdr's built-in layouts don't take new panels, so make your own copy of the layout first. Skip that line if you already use a layout of your own.

```sh
git clone https://github.com/jjangsky/herdr-pr-flow
herdr-app do layout.clone '{"name":"main","as":"main-pr"}'
cp -R herdr-pr-flow/mods/pr-flow ~/.config/herdr-app/mods/
herdr-app check ~/.config/herdr-app/mods/pr-flow
```

The panel appears on the right of the window, 340 pixels wide. A copied layout doesn't receive later changes Herdr makes to `main`.

Or ask an agent running in Herdr:

```text
Read ~/.config/herdr-app/AGENTS.md, then add this mod: github.com/jjangsky/herdr-pr-flow
```

To update, copy the folder again. To remove it, press `cmd-shift-l` to go back to your earlier layout, then delete `~/.config/herdr-app/mods/pr-flow` and `~/.config/herdr-app/layouts/main-pr.json`. Your terminals and agents aren't affected.

## Using it

**1. Watch the list.** Each card shows the PR, its repo and number, its linked issue, CI and review, and the agent working on it. Click a card to open it. When the PRs span more than one owner, a row of chips under the title shows one owner's PRs (user or organization, with counts); `All` shows them all again. With an owner chosen who has PRs in more than one repo, a second row does the same per repo. The choice is remembered.

<img src="docs/images/en/list.png" width="340" alt="A list of four PRs with their CI, review, linked issue and agent">

**2. Follow a merge.** After a merge, the card shows the workflow that's running and the step it's on. If a run fails, the failure comes first.

<img src="docs/images/en/merged.png" width="340" alt="A merged PR card showing Deploy Production on step 2 of 5">

**3. Open the PR.** The timeline shows each stage with its time. Every workflow gets its own row. Below it are linked issues, open comments, changed files and the description.

<img src="docs/images/en/pr-running.png" width="340" alt="A PR timeline with two workflows running">

**4. See each step.** Click a workflow to list its jobs and steps. Click `CI passed` to list the checks. A failed run has `Show log`, and `GitHub` opens the run in your browser.

<img src="docs/images/en/pr-steps.png" width="340" alt="A workflow expanded to its steps">

**5. Read the issue.** Click a linked issue to read its labels, body and comments.

<img src="docs/images/en/issue.png" width="340" alt="A linked issue open in the panel">

**6. See the changes.** Click a changed file or a failed log to open it in a pane beside your terminal. Opening another file replaces what the pane shows.

<img src="docs/images/en/diff.png" alt="A file diff in a pane beside the panel">

**Merge (optional).** With `merge` set, a PR that is ready to merge gets a `Merge (squash)` button under its branch. The first press arms it for 4 seconds (`Press again to merge`), the second merges. It merges only the commit you were looking at: if something was pushed since, GitHub refuses and the panel shows why.

**7. Tell the agent.** Click the agent row at the top of a PR to jump to its terminal.

### Keys

Click the panel first so it has the keyboard.

| Screen | Key | Action |
| --- | --- | --- |
| List | `j` `k`, arrows | Move |
| List | `enter` | Open the PR |
| List | `g` | Go to the agent |
| List | `o` | Open on GitHub |
| List | `r` | Refresh |
| PR | `enter`, `g` | Go to the agent |
| PR | `o` | Open on GitHub |
| PR, issue, settings | `esc`, `backspace` | Back |
| Issue | `o` | Open on GitHub |

## Reading the states

| Shown | Meaning |
| --- | --- |
| `CI` with a check | Every check passed |
| `CI running 2/4` | 2 of 4 checks have finished |
| `CI failed` | At least one check failed |
| `No CI` | No check reported, even after waiting `ci_wait` for a new commit |
| `Approved`, `Changes requested`, `Waiting for review` | GitHub's review decision |
| `AI reviewing`, `Reviewed` | An AI review job is running, or a review exists without a decision |
| `No review` | Nobody has reviewed it |
| Comment icon and a number | Review threads still open |
| `Merge conflict`, `Ready to merge` | What GitHub reports |
| `Merged → main` | Merged, and into which branch |
| `Deploy · Build (2/5)` | That workflow's current step |
| `Deploy · waiting for approval` | The run is waiting for someone to approve it |
| `2 runs after merge finished` | All of them succeeded |
| `Issue #5`, `2 issues`, `No issue` | Issues linked to the PR |

Jobs such as `claude-review` are recognized as AI review by name, so their result isn't reported as a CI failure. Add others with `ai_checks`.

A finished workflow means its job succeeded. It doesn't prove your service is healthy.

### Linking an issue

An issue shows up when GitHub links it to the PR: a keyword such as `Closes #5` in the PR body, or a link set in the PR's sidebar. A plain `#5` isn't a link. Asking your agent to write `Closes #<number>` is enough.

## How PRs are found and refreshed

PR Flow asks GitHub on a timer, so it can lag behind by the times below.

| What | How often |
| --- | --- |
| Agent status | 5 seconds |
| New PR, working agent | 30 seconds, and right after it finishes |
| New PR, idle agent | 2 minutes |
| Your open PRs, with `mine` | 5 minutes |
| Open PR with an agent | `poll_seconds` (30 seconds) |
| Open PR without an agent | 4 × `poll_seconds` (2 minutes) |
| Workflows after a merge | 15 seconds while running |

Once found, a PR stays listed after its agent exits or changes branch. A closed PR leaves the list. A merged one leaves 24 hours after the merge, once its workflows have finished.

## Settings

The settings button at the top of the panel chooses the language: follow the system, 한국어 or English.

Everything else goes in the block's `props` in your layout file (`~/.config/herdr-app/layouts/main-pr.json`):

```json
{ "type": "block", "content": { "mod": "pr-flow", "props": { "poll_seconds": 60, "ci_wait": "5m", "ai_checks": ["nightly review"] } } }
```

| Prop | Default | Meaning |
| --- | --- | --- |
| `poll_seconds` | `30` | How often an open PR refreshes. The minimum is 10 |
| `ci_wait` | `"2m"` | How long a new commit waits for checks before showing `No CI` |
| `ai_checks` | `[]` | CI jobs that are really AI review |
| `mine` | `false` | Also list every open PR you authored, with or without an agent on it |
| `merge` | none | `"squash"`, `"merge"` or `"rebase"`: show a merge button on PRs ready to merge, using that method. Unset, nothing is ever written |
| `lang` | system | `"en"` or `"ko"`, used until you choose in settings |

## What it runs

This is what the mod does on your machine, all with your own login. It stores no credentials.

- `gh pr list`, `gh search prs --author @me` (with `mine`), `gh pr view`, `gh pr diff`, `gh issue view`, `gh run view` and read-only `gh api` calls
- With `merge`, when you press the button twice: `gh pr merge <url> --<method> --match-head-commit <sha>`. No `--admin`, no branch deletion
- `git remote get-url origin` in each agent's folder
- `sh` to read your language, and `defaults` on macOS when the app has no `LANG`
- `open`, `xdg-open` or `explorer.exe` to open a link

## Troubleshooting

| What you see | What to do |
| --- | --- |
| No panel after installing | The built-in `main` layout doesn't take new panels. Run the `layout.clone` line, then copy the folder again under a fresh start: remove `mods/pr-flow`, then copy it |
| `GitHub CLI is not ready` | Run `gh auth login`, then refresh |
| A PR is missing | Check that an agent is running on that branch, the PR is open, and the folder's `origin` is on GitHub |
| A linked issue is missing | Use `Closes #5` in the PR body. A plain `#5` isn't a link |
| No workflows after a merge | The repo has no GitHub Actions run on the merge commit. Other deploy systems aren't shown |
| `Could not load the log` | Very large logs can pass the app's 30 second and 8 MiB limit. Open it on GitHub |

## Limits

- PRs are found through agents running in Herdr. PRs you opened elsewhere aren't listed unless `mine` is on. PRs that only ask for your review aren't listed.
- The refresh button updates listed PRs. It doesn't look for new ones, which arrive on the timer above.
- Step-by-step tracking is for GitHub Actions after a merge. Before a merge you see each check's name and result. Deploys outside Actions, such as Vercel, aren't shown.
- A flow across two PRs, such as `development` then `live`, shows as two separate PRs.
- After a merge, a listed issue's state isn't refreshed. Opening the issue always loads it fresh.
- Herdr must be running for the panel to refresh. The repo must be on GitHub, and the remote must be called `origin`.
- It polls while the panel is hidden too, so many PRs use more of your GitHub API limit. Raise `poll_seconds` if needed.

## Development

```sh
npm test                                       # needs Node.js 20 or later
herdr-app check "$PWD/mods/pr-flow"
python3 scripts/demo/capture.py /tmp/prdemo en out   # redraws the README's screens with made-up data
```

The mod is plain JavaScript with no dependencies. Only `main.js` touches the app, so the rest runs under Node in tests. `RECIPE.md` is the brief for rebuilding it. `capture.py` needs Pillow, and opens a separate Herdr window for about a minute.

## License

MIT
