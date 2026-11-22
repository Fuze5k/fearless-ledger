# How I built Fearless Ledger with an AI agent and JetBrains tools

I built this solo. Claude Code was the coding agent for almost all of the code; I set the direction, made the
calls on what to build, and checked the result. WebStorm was the IDE for the project, its inspections and its
settings. This file is the honest account of who did what, including what did not work.

## The setup

- **Claude Code** (Claude Opus) as the agent: it read the data, wrote the ETL, the web app, the deploy workflow
  and these documents, ran the builds and checked the app in a browser.
- **WebStorm 2026.3** for the project: project model and excludes, the ESLint inspection profile and a full
  inspection pass. The `.idea/` folder is committed so the settings are part of the repo.
- **JetBrains Air** in WebStorm with the Claude agent, for the "Copy as text" feature: see "Air session" below.
- **Privacy:** the data license asks that any AI tool's option to keep inputs out of training is on. "Help improve
  Claude" was switched off before the data was opened.

## The workflow, step by step

### 1. Rules and data first, no code

The agent read the rules, the submission specifics and the data license, then the 2025 gallery: all 26 drafting
entries of last year were single-game pick recommenders, and only 3 mentioned Fearless. That is why this tool plans
a whole series.

Before writing the app it ran a go/no-go check on the data, because the idea is useless without it: are drafts
complete, and is hard Fearless really in force? In a sample of 60 series across all 20 events, 145 of 145 games had
all 20 draft actions; of about 570 multi-game series only 5 repeated a champion. The check passed, so we built.

### 2. Pipeline and app

The agent wrote `etl/extract.py` and `etl/aggregate.py` in Python 3.14 (the standard library's new
`compression.zstd` reads the feeds without extra packages), then the Vite + React + TypeScript app on top of the
aggregates. Things it found in the data rather than assumed:

- the feed's player order matches the five roles only about 75% of the time, so roles are inferred from players'
  histories;
- in the 2026 LEC and LCS data red side has first pick in about 40% of games, so nothing assumes blue picks first.

### 3. License-safe deploy

The data may not be committed or redistributed, but the Devpost team confirmed on the forum that aggregate stats in
a hosted demo are fine. So the GitHub Pages workflow clones the data in CI, runs the ETL and publishes only the
aggregates. The agent checked every commit to make sure nothing derived from the data is in git.

### 4. Review by a second agent

When the core was done, a separate reviewer agent with no context from the build read the code cold. It found six
real problems, among them games dropped when a substitute had no champion listed (about 28 series had wrong
records), live roles that did not update after a pick, and counts shown without their denominator. All six were
fixed in one commit (5419ac0) and re-checked against numbers the reviewer recomputed.

### 5. WebStorm inspections

WebStorm's inspections were run over the whole project with `inspect.sh`, the IDE's headless inspection runner,
using the committed profile. It reported 19 findings. The real ones were fixed in 33e6741: unused code and imports,
fractional pixel font sizes, and inconsistent spelling. The rest were false positives (the grammar checker flagging
"phase-1" and a code span, and the workflow inspection not resolving inputs of a third-party action), left as they
are.

### 6. Features driven by the brief

The brief's "next level" for Category 2 asks for data-backed "how to win" counters. The agent added win-loss records
with and against each champion, by side, by pick order and after game 1, and shows a line only when it sits far
enough from the team's own average to mean something (a z-score of at least 1, at least 4 games). The same records
now rank the live-draft options. A predicted win rate was considered and left out: with 11 to 65 series per team it
would look precise and not be.

## Air session

In WebStorm 2026.3 I set up JetBrains Air with the Claude agent (terminal mode, the native Claude provider) and
turned the other agents (Junie, Codex, Copilot) off, so there was one agent per project. Air does not need a
JetBrains AI plan for this: it runs the locally installed Claude Code with its own subscription.

The task was small on purpose, so the result is easy to check: a "Copy as text" button on the Series sheet that
puts the sheet into the clipboard as plain text for a team Discord, with the header, key tendencies, "How to beat
them" and our plan per game, each line with its evidence in brackets. The prompt asked to reuse `insights()` and
`howToWin()`, not to change what the sheet shows, to show the clipboard error instead of failing silently, and to
run lint and build without committing.

A Claude Code session started in the project folder did the work, and Air in WebStorm registered it as an agent
session of this project (WebStorm's log records it as the project's current agent identity). It changed two files,
`web/src/SeriesSheet.tsx` and `web/src/index.css`, about 90 added lines: a small converter that turns the insight text
(fragments and bold only) into plain text and refuses anything it cannot convert, the plan lines, and a button that
shows "Copied" for two seconds or "Copy failed: ..." with the reason. Lint and build were clean.

Then I checked it outside the session: read the diff, ran lint and build again, and drove the built app in a
headless browser. The copied text matched the sheet, the label went back after two seconds, and with the clipboard
blocked the page showed the error. It is committed as ce30abd.

## What did not work, and feedback for JetBrains

- **An agent cannot drive the IDE's UI.** The agent ran in the Claude desktop app and could click in WebStorm but
  not type in it (the computer-use tool restricts IDEs to clicks on purpose). Anything that needs a typed prompt in
  the IDE, such as starting an Air session, has to be done by a person.
- **Headless inspections need the IDE closed.** `inspect.sh` refuses to run while WebStorm is open ("Only one
  instance"). A way to run the project's inspections against the running IDE from the command line would make them
  easy to use in an agent's loop.
- **The IDE's MCP server needs a token from the UI.** Connecting an external agent to WebStorm's MCP server means
  copying a token out of the settings, which I did not want an agent to handle. A per-project, local-only approval
  would help.

## Evidence in the repo

- `.idea/`: project model, excludes for generated data and the inspection profile.
- Commit history: one commit per milestone, each message saying what changed and why.
- `METHODOLOGY.md`: the approach and the statistics behind every insight.
