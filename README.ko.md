# PR Flow

[English](README.md) | **한국어**

![PR Flow: Herdr 옆 패널의 PR 목록과 PR 타임라인](docs/thumbnail.png)

에이전트가 올린 PR이 어디까지 갔는지 보여주는 [Herdr 앱](https://herdr.dev)용 옆 패널입니다. CI부터 머지 후 실행되는 워크플로까지 볼 수 있습니다.

![에이전트 옆의 PR Flow: PR이 CI를 거쳐 머지되고, 배포 워크플로가 단계별로 진행되며, 연결된 이슈와 diff가 열립니다](docs/demo-ko.gif)

*실제 모드를 Herdr 앱에서 실행한 화면입니다. 프로젝트와 데이터는 샘플입니다.*

PR Flow는 머지 버튼(`merge`, 기본은 꺼짐)을 켜지 않는 한 조회만 합니다. 에이전트에게는 아무것도 보내지 않습니다. 할 일이 있으면 그 에이전트로 이동해서 직접 말하면 됩니다.

- **설정 없음:** Herdr에서 돌아가는 에이전트의 브랜치에 열린 PR이 있으면 자동으로 나타납니다.
- **있는 그대로의 상태:** `CI 없음`, `리뷰 없음`은 없다고 표시하고, 통과로 치지 않습니다.
- **머지 후까지:** 어떤 워크플로가 몇 번째 단계에 있는지 보여줍니다. 이름은 저장소의 워크플로 파일에 적힌 그대로입니다.
- **연결된 이슈:** PR이 닫을 이슈를 패널에서 바로 읽습니다.

## 목차

- [현재 상태](#현재-상태)
- [준비물](#준비물)
- [설치](#설치)
- [사용법](#사용법)
- [상태 읽는 법](#상태-읽는-법)
- [PR을 찾고 갱신하는 방식](#pr을-찾고-갱신하는-방식)
- [설정](#설정)
- [실행하는 명령](#실행하는-명령)
- [문제 해결](#문제-해결)
- [제한 사항](#제한-사항)
- [개발](#개발)

## 현재 상태

초기 버전(0.3.0)입니다. macOS의 `herdr-app` 0.1.12에서 실제 PR과 Claude Code 에이전트로 시험했습니다. Codex, Linux, Windows, 원격 머신은 아직 시험하지 않았습니다.

## 준비물

- Herdr 데스크톱 앱
- 로그인된 [GitHub CLI](https://cli.github.com) (`gh auth status`로 확인)

## 설치

Herdr 기본 레이아웃에는 새 패널이 붙지 않아서, 먼저 레이아웃을 복제합니다. 이미 직접 만든 레이아웃을 쓰고 있다면 `layout.clone` 줄은 건너뜁니다.

```sh
git clone https://github.com/jjangsky/herdr-pr-flow
herdr-app do layout.clone '{"name":"main","as":"main-pr"}'
cp -R herdr-pr-flow/mods/pr-flow ~/.config/herdr-app/mods/
herdr-app check ~/.config/herdr-app/mods/pr-flow
```

창 오른쪽에 너비 340픽셀로 패널이 나타납니다. 복제한 레이아웃에는 이후 Herdr가 `main`에 적용하는 변경이 반영되지 않습니다.

Herdr 안의 에이전트에게 맡겨도 됩니다.

```text
Read ~/.config/herdr-app/AGENTS.md, then add this mod: github.com/jjangsky/herdr-pr-flow
```

업데이트하려면 폴더를 다시 복사합니다. 제거하려면 `cmd-shift-l`로 이전 레이아웃으로 돌아간 뒤 `~/.config/herdr-app/mods/pr-flow`와 `~/.config/herdr-app/layouts/main-pr.json`을 지웁니다. 터미널과 에이전트는 영향을 받지 않습니다.

## 사용법

**1. 목록 보기:** 카드마다 PR, 저장소와 번호, 연결된 이슈, CI와 리뷰, 담당 에이전트가 나옵니다. 카드를 누르면 PR이 열립니다. PR의 소유자(사용자나 조직)가 둘 이상이면 제목 아래 칩 한 줄로 소유자별로 볼 수 있고(개수 포함), `전체`를 누르면 다시 모두 보입니다. 고른 소유자의 PR이 여러 레포에 있으면 그 아래 한 줄이 더 생겨 레포별로 볼 수 있습니다. 고른 것은 기억됩니다.

<img src="docs/images/ko/list.png" width="340" alt="PR 4개의 CI, 리뷰, 연결된 이슈, 에이전트가 표시된 목록">

**2. 머지 따라가기:** 머지하면 카드에 실행 중인 워크플로와 현재 단계가 나옵니다. 실패한 실행이 있으면 그것부터 보여줍니다.

<img src="docs/images/ko/merged.png" width="340" alt="Deploy Production이 5단계 중 2단계에 있는 머지된 PR 카드">

**3. PR 열기:** 타임라인에 단계별 시각이 나오고, 워크플로마다 줄이 하나씩 생깁니다. 그 아래에 연결된 이슈, 안 끝난 코멘트, 변경 파일, 설명이 있습니다.

<img src="docs/images/ko/pr-running.png" width="340" alt="워크플로 2개가 실행 중인 PR 타임라인">

**4. 단계 보기:** 워크플로를 누르면 잡과 스텝이 펼쳐집니다. `CI 통과`를 누르면 체크 목록이 펼쳐집니다. 실패한 실행에는 `로그 보기`가 있고, `GitHub`를 누르면 그 실행을 브라우저로 엽니다.

<img src="docs/images/ko/pr-steps.png" width="340" alt="스텝까지 펼친 워크플로">

**5. 이슈 읽기:** 연결된 이슈를 누르면 라벨, 본문, 코멘트를 읽을 수 있습니다.

<img src="docs/images/ko/issue.png" width="340" alt="패널에서 연 연결된 이슈">

**6. 변경 내용 보기:** 변경 파일이나 실패 로그를 누르면 터미널 옆 pane에 열립니다. 다른 파일을 누르면 그 pane의 내용이 바뀝니다.

<img src="docs/images/ko/diff.png" alt="패널 옆 pane에 열린 파일 diff">

**머지 (선택):** `merge`를 설정하면 머지 가능한 PR의 브랜치 아래에 `머지 (squash)` 버튼이 생깁니다. 처음 누르면 4초 동안 `한 번 더 누르면 머지`로 바뀌고, 다시 누르면 머지합니다. 보고 있던 커밋만 머지하므로, 그 사이에 새 커밋이 올라왔으면 GitHub가 거절하고 패널에 이유가 나옵니다.

**7. 에이전트에게 말하기:** PR 위쪽의 에이전트 줄을 누르면 그 터미널로 이동합니다.

### 단축키

패널을 먼저 눌러서 키보드 입력을 받게 합니다.

| 화면 | 키 | 동작 |
| --- | --- | --- |
| 목록 | `j` `k`, 방향키 | 이동 |
| 목록 | `enter` | PR 열기 |
| 목록 | `g` | 에이전트로 이동 |
| 목록 | `o` | GitHub에서 열기 |
| 목록 | `r` | 새로고침 |
| PR | `enter`, `g` | 에이전트로 이동 |
| PR | `o` | GitHub에서 열기 |
| PR, 이슈, 설정 | `esc`, `backspace` | 뒤로 |
| 이슈 | `o` | GitHub에서 열기 |

## 상태 읽는 법

| 표시 | 뜻 |
| --- | --- |
| 체크 표시와 `CI` | 모든 체크 통과 |
| `CI 실행 중 2/4` | 체크 4개 중 2개 끝남 |
| `CI 실패` | 체크가 하나 이상 실패 |
| `CI 없음` | 새 커밋 후 `ci_wait`만큼 기다려도 보고된 체크가 없음 |
| `승인`, `변경 요청`, `리뷰 대기` | GitHub의 리뷰 결정 |
| `AI 리뷰 중`, `리뷰됨` | AI 리뷰 작업이 실행 중이거나, 결정 없이 리뷰만 있음 |
| `리뷰 없음` | 아무도 리뷰하지 않음 |
| 코멘트 아이콘과 숫자 | 안 끝난 리뷰 스레드 수 |
| `머지 충돌`, `머지 가능` | GitHub가 보고한 그대로 |
| `머지됨 → main` | 머지됐고 어느 브랜치로 들어갔는지 |
| `Deploy · Build (2/5)` | 그 워크플로의 현재 단계 |
| `Deploy · 승인 대기` | 실행이 누군가의 승인을 기다리는 중 |
| `머지 후 실행 2개 완료` | 전부 성공 |
| `이슈 #5`, `이슈 2개`, `이슈 없음` | PR에 연결된 이슈 |

`claude-review` 같은 작업은 이름으로 AI 리뷰임을 알아보고, 실패해도 CI 실패로 표시하지 않습니다. 다른 이름은 `ai_checks`에 추가하세요.

워크플로가 끝났다는 것은 그 작업이 성공했다는 뜻입니다. 서비스가 정상이라는 보장은 아닙니다.

### 이슈 연결하기

GitHub가 PR과 연결한 이슈만 나타납니다. PR 본문의 `Closes #5` 같은 키워드나 PR 사이드바의 연결이 해당합니다. `#5`만 적으면 연결이 아닙니다. 에이전트에게 `Closes #번호`를 적게 하면 충분합니다.

## PR을 찾고 갱신하는 방식

PR Flow는 일정 주기로 GitHub에 물어봅니다. 그래서 아래 시간만큼 늦게 보일 수 있습니다.

| 항목 | 주기 |
| --- | --- |
| 에이전트 상태 | 5초 |
| 새 PR, 작업 중인 에이전트 | 30초, 그리고 작업을 마친 직후 |
| 새 PR, 대기 중인 에이전트 | 2분 |
| 내가 올린 열린 PR, `mine`일 때 | 5분 |
| 열린 PR, 에이전트 있음 | `poll_seconds` (30초) |
| 열린 PR, 에이전트 없음 | `poll_seconds`의 4배 (2분) |
| 머지 후 워크플로 | 실행 중에 15초 |

한 번 잡힌 PR은 에이전트가 종료되거나 브랜치를 옮겨도 목록에 남습니다. 닫힌 PR은 목록에서 사라집니다. 머지된 PR은 머지 후 24시간이 지나고 워크플로가 끝나면 사라집니다.

## 설정

패널 위쪽의 설정 버튼에서 언어를 고릅니다. 시스템 언어 따르기, 한국어, English 중에서 선택합니다.

나머지는 레이아웃 파일(`~/.config/herdr-app/layouts/main-pr.json`)의 블록 `props`에 적습니다.

```json
{ "type": "block", "content": { "mod": "pr-flow", "props": { "poll_seconds": 60, "ci_wait": "5m", "ai_checks": ["nightly review"] } } }
```

| 항목 | 기본값 | 뜻 |
| --- | --- | --- |
| `poll_seconds` | `30` | 열린 PR의 갱신 주기. 최솟값은 10 |
| `ci_wait` | `"2m"` | 새 커밋 후 체크를 기다렸다가 `CI 없음`으로 표시하기까지의 시간 |
| `ai_checks` | `[]` | 실제로는 AI 리뷰인 CI 작업 |
| `mine` | `false` | 에이전트가 있든 없든, 내가 올린 열린 PR도 모두 보여줌 |
| `merge` | 없음 | `"squash"`, `"merge"`, `"rebase"` 중 하나: 머지 가능한 PR에 그 방식의 머지 버튼을 보여줌. 없으면 GitHub에 아무것도 쓰지 않음 |
| `lang` | 시스템 언어 | `"en"` 또는 `"ko"`. 설정에서 고르기 전까지 적용 |

## 실행하는 명령

이 모드가 PC에서 실행하는 명령입니다. 모두 사용자의 로그인으로 실행하고, 인증 정보는 저장하지 않습니다.

- `gh pr list`, `gh search prs --author @me` (`mine`일 때), `gh pr view`, `gh pr diff`, `gh issue view`, `gh run view`, 읽기 전용 `gh api` 호출
- `merge`를 켜고 버튼을 두 번 눌렀을 때: `gh pr merge <url> --<방식> --match-head-commit <sha>`. `--admin`도 브랜치 삭제도 하지 않음
- 각 에이전트 폴더에서 `git remote get-url origin`
- 언어를 읽는 `sh`, 앱에 `LANG`이 없을 때 macOS의 `defaults`
- 링크를 여는 `open`, `xdg-open`, `explorer.exe`

## 문제 해결

| 증상 | 해결 |
| --- | --- |
| 설치했는데 패널이 안 보임 | 기본 `main` 레이아웃에는 새 패널이 붙지 않습니다. `layout.clone`을 실행한 뒤 `mods/pr-flow`를 지우고 다시 복사하세요 |
| `GitHub CLI를 쓸 수 없습니다` | `gh auth login`을 실행한 뒤 새로고침하세요 |
| PR이 안 보임 | 그 브랜치에 에이전트가 있는지, PR이 열려 있는지, 폴더의 `origin`이 GitHub인지 확인하세요 |
| 연결된 이슈가 안 보임 | PR 본문에 `Closes #5`를 적으세요. `#5`만 적으면 연결이 아닙니다 |
| 머지 후 워크플로가 안 보임 | 머지 커밋에서 실행된 GitHub Actions가 없는 경우입니다. 다른 배포 도구는 보이지 않습니다 |
| `로그를 불러오지 못했습니다` | 아주 큰 로그는 앱의 30초, 8MiB 제한에 걸릴 수 있습니다. GitHub에서 확인하세요 |

## 제한 사항

- PR은 Herdr에서 돌아가는 에이전트를 통해 찾습니다. 다른 곳에서 올린 PR은 `mine`을 켜야 나옵니다. 리뷰 요청만 받은 PR은 나오지 않습니다.
- 새로고침 버튼은 목록에 있는 PR만 갱신합니다. 새 PR은 위 주기에 맞춰 나타납니다.
- 단계별 추적은 머지 후 GitHub Actions만 지원합니다. 머지 전에는 체크 이름과 결과까지 보여줍니다. Vercel처럼 Actions 밖에서 도는 배포는 보이지 않습니다.
- `development` 다음 `live`처럼 PR이 두 번 올라가는 흐름은 별개의 PR로 보입니다.
- 머지 후에는 목록의 이슈 상태가 갱신되지 않습니다. 이슈 화면은 열 때마다 새로 불러옵니다.
- Herdr가 켜져 있어야 갱신됩니다. 저장소는 GitHub에 있어야 하고, 원격 이름은 `origin`이어야 합니다.
- 패널이 숨겨져 있어도 조회하므로, PR이 많으면 GitHub API 사용량이 늘어납니다. 필요하면 `poll_seconds`를 늘리세요.

## 개발

```sh
npm test                                       # Node.js 20 이상 필요
herdr-app check "$PWD/mods/pr-flow"
python3 scripts/demo/capture.py /tmp/prdemo ko out   # README 화면을 샘플 데이터로 다시 그림
```

이 모드는 의존성 없는 순수 JavaScript입니다. 앱과 직접 닿는 파일은 `main.js`뿐이라, 나머지는 테스트에서 Node로 실행됩니다. `RECIPE.md`는 모드를 다시 만들기 위한 안내서입니다. `capture.py`는 Pillow가 필요하고, 1분 정도 별도의 Herdr 창을 엽니다.

## 라이선스

MIT
