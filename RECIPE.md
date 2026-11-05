# PR Flow

A full-height panel on the right of the Herdr window. It lists every open pull request that belongs to a branch an agent is working on, and shows where each one is: CI, review, merge, then the GitHub Actions workflows that run on the merge commit. Clicking a PR swaps the list for its detail in the same panel. It only reads, unless the `merge` prop turns on a merge button.

![PR Flow](preview.png)

## What you see

The panel is 340px wide, drawn with `theme()` colors on `background`, with a 1px `border` and 10px corners. Every screen has a 42px header with a bottom border. Text is 13px, with 11.5px dim captions.

- **List.** Header: `Pull requests`, a count chip, a settings button, a refresh button (26px, hover `hover`). Cards, 10px padding and 8px corners, selected on `selected`:
  1. Title, truncated, medium weight. Dimmed when merged and all its workflows have settled.
  2. `repo #number · Issue #5` on the left, the update time on the right, in `dim`.
  3. Facts with 12px icons: CI, review, open comment count, merge state.
  4. After a merge: the lead workflow, such as `Deploy · Build (2/5)`, then `+1 more`.
  5. The agent, if there is one: status mark, then `Claude Code · space name`.
- **PR detail.** Header: `List` back button, `GitHub` link. Title at 15px semibold, `owner/repo #n`, `head → base`. An agent row on `raised`, 38px, with `Go`. Then the sections `Progress` (a vertical timeline with 20px marks joined by a 1px `border` line), failed log (the last 8 lines in the terminal font), linked issues, open comments, changed files with `+n −n`, and the description as markdown. `No linked issues` stands in when there are none.
- **Issue.** Header: `PR #n` back button, `GitHub`. Title, state dot and label, number, author, age, label chips, body as markdown, the last 20 comments on `raised`.
- **Settings.** Header: `List` back button, `Settings`. A `Language` section: follow system, 한국어, English, with a check on the chosen one.
- **Viewer pane.** Opened beside a terminal for a diff or a full log. For a diff, a 220px file list (150px below 620px wide) and numbered lines 20px tall, tinted with `ansi2`/`ansi1` at `18` alpha.
- **Empty.** A merge icon, `No pull requests yet`, and one line of help, centered.

Colors by state: passed `ansi2`, failed `ansi1`, changes requested `blocked`, running `working`, merged `ansi5`, not started `dim`.

## How it behaves

- **Agent status.** `working` is a spinning ring in `working`. `blocked` is a dot in `blocked`, `done` a dot in `done`, `idle` a dot in `dim`.
- **Clicks.** A card opens the PR. The agent row runs `agent.focus`. A workflow row, or `CI passed`, expands in place. A changed file or `Show log` opens the viewer, reusing a viewer pane that's already open. `GitHub` opens the browser.
- **Keys**, with the panel focused. List: `j` `k` arrows, `enter`, `g`, `o`, `r`. PR: `enter` or `g`, `o`, `esc` or `backspace`. Issue and settings: `esc` or `backspace`.
- **Owners.** With PRs from more than one owner (the part of `owner/repo` before the slash), a 36 px row under the header: 10 px sides, 4 px gap, bottom border, scrolls sideways. Chips 22 px, 8 px sides, radius 6: `All` and each owner, most PRs first, with the count in `dim`; chosen `selected`, else `raised`. A chip shows only that owner's PRs; the choice is `localStorage` `org`, and an owner with no PRs left shows all. `pr-flow.org:<owner>` chooses one, `pr-flow.org` all.
- **Repos.** With an owner chosen whose PRs are in more than one repo, a 32 px row under it, the same chips: `All repos` and each repo by name, most PRs first. `localStorage` `repo`; choosing another owner clears it. `pr-flow.repo:<owner/name>` chooses a repo and its owner.
- **Commands.** `pr-flow.next`, `prev`, `open`, `back`, `agent`, `github`, `refresh`, `settings`, `lang-auto`, `lang-ko`, `lang-en`.
- **Order.** Newest update first. Merged PRs whose workflows have settled go last. The selection stays on its PR when rows move.
- **What moves.** A timer every 5 s reads agents. PRs are looked for every 30 s for a working agent, every 2 min for an idle one, and straight away when an agent stops working. With `mine`, `gh search prs --author @me --state open` runs every 5 min and adds what it finds. Open PRs refresh every `poll_seconds`, four times slower with no agent. After a merge only Actions is polled, every 15 s, until runs have finished and 3 minutes have passed. Redraws happen only when something visible changed, plus once a minute for relative times.
- **What leaves.** Closed PRs at once. Merged PRs 24 hours after the merge, once their workflows are finished.

## Built from

Files in `mods/pr-flow/`: `main.js` (the only file that imports `gpui-kit`, `gpui-base`, `herdr`), `tracker.js` (the loop, with everything injected), `status.js` and `present.js` (state to words), `flow.js` (Actions runs), `gh.js`, `diff.js`, `text.js`, `i18n.js`, and its SVG icons. `mod.json` is `{ "place": "right", "size": 340 }`.

A layout block: `{ "type": "block", "content": { "mod": "pr-flow", "props": { "poll_seconds": 30, "ci_wait": "2m", "ai_checks": [], "mine": false, "lang": "en" } } }`. All props are optional. The viewer is the same mod with `props: { "screen": "viewer" }`, reading its target from `shared("pr-flow.view")`. The chosen language is `shared("pr-flow.lang")`. The PR list is `localStorage`.

Uses `agents()`, `panes()` (`cwd` and `branch` for each agent), `spaces()` (`machine`), `exec`, `run`, `theme`, `settings`, `shared`, `setShared`, `nextCommand`, `window`. Commands: `agent.focus`, `pane.split`, `pane.focus`, `pane.close`, `tab.new`.

Programs: `gh` (`pr list`, `pr view`, `pr diff`, `issue view`, `run view`, `auth status`, `api` with the GraphQL review threads and linked issues query, `actions/runs?head_sha=`, `actions/runs/<id>/jobs`), `git remote get-url origin`, `sh`, `defaults`, and `open`, `xdg-open` or `explorer.exe`. Nothing it calls writes to GitHub.

## Watch out

- The merge button (`merge`: `"squash"`, `"merge"` or `"rebase"`; anything else, no button) shows under the branch line only when the PR is open, not a draft, `mergeable` is `MERGEABLE` and the state is `ready`. 32 px, radius 8, `raised`; armed, `ansi2` with `background` text for 4 s. It runs `gh pr merge <url> --<method> --match-head-commit <headRefOid shown>`, then refreshes the PR; an error shows under it in `ansi1`. Never `--admin`, never `--delete-branch`.

- Shipped layouts don't take new panels: a mod with `place: "right"` docks only into a personal layout, so `layout.clone` first.
- A virtual list's rows can't register `on_click`, and `herdr-app check` doesn't catch it, since it doesn't run deferred rows. The list is a plain scrolling column.
- An app started from the Finder has no `LANG`. Fall back to `defaults read -g AppleLocale`.
- `exec` stops at 30 s and 8 MiB, so a huge diff or log fails. Offer the GitHub link.
- A saved file reloads the mod, and the old build's waiting `nextCommand()` can swallow the first command after it.
- A commit's combined status can say `pending` with no statuses at all. Read the runs instead.
- GitHub logs start with a byte order mark and mark lines with `##[error]`. Strip both.
- Agent titles, PR titles and logs come from outside: strip escape codes and bidi controls.
- `gh pr list --state all` would find an old merged PR for an agent sitting on `main`. Ask for open PRs only.
- Limits: 100 review threads, 10 linked issues, 50 runs per commit, 50 jobs per run. Issue state isn't refreshed after a merge. Keyboard selection doesn't scroll the list.
- Assumes `gh` is logged in and the remote is called `origin` on GitHub.

## Done when

- `herdr-app check` passes, and the panel docks at the right of a cloned layout.
- With no agent on a PR branch, the empty screen shows. If `gh` isn't logged in, it says so.
- An agent on a branch with an open PR makes a card appear, with that agent named, without any setup.
- Clicking the card shows the timeline, and `List` comes back. The agent row moves focus to that agent's terminal.
- A repo without checks shows `No CI`, and it's never shown as passed.
- PR body `Closes #5` shows `Issue #5` on the card, and clicking it in the PR opens the issue. Without one, `No issue`.
- Merging the PR shows `Merged → main`, then the running workflow and its step, updating as it runs, and finally `2 runs after merge finished`.
- A failing workflow turns red on the card, and `Show log` opens its log in a pane.
- Choosing English in settings changes the text in the panel and the viewer, and it survives a restart.
- No command it runs writes to GitHub.
