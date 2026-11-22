# Methodology

## The problem

Category 2 asks for a tool that takes the spreadsheet chaos out of draft prep and supports Fearless Draft. The two
questions the brief puts to it are "what pick/ban tendencies repeat most often for this opponent?" and "how does
their draft shift in game 3, 4 or 5 of a Fearless series?".

Under Fearless, a champion picked in any game is gone for both teams for the rest of the series. So a draft is not
one decision but five linked ones, and the useful unit of prep is the series, not the game. A coach needs to know
what an opponent spends early and what they save, how deep each player's pool really is, and which picks of ours
take the most away from them later. That is what Fearless Ledger computes and puts on one screen and one page.

## Data

GRID match data from the hackathon starter repository: 745 LoL series and 1,741 games from LCK, LEC, LTA North,
LTA South and LCS, 2025-2026. After cleaning, 1,738 games are kept and 1,722 have a complete draft (10 bans and
10 picks in order). The data covers 45 teams; 40 of them have between 11 and 65 series.

Before building anything I checked two things that the whole idea depends on:

- Full drafts. In a sample of 60 series across all 20 events, every game (145 of 145) had all 20 draft actions
  with sequence numbers.
- Hard Fearless. Of about 570 multi-game series, only 5 showed a champion picked twice in one series, so the data
  is played under hard Fearless throughout.

## Pipeline

1. `etl/extract.py` reads each game's feed (zstd JSON lines), takes the final full series state of each feed
   session and writes one record per game: teams, sides, winner, game number, the 20 draft actions and the five
   champions per team.
2. `etl/aggregate.py` turns those records into small JSON files per team, for two windows: the last 15 series and
   all of 2025-2026. They hold counts, rates and pools only, no per-game rows.
3. The web app (Vite, React, TypeScript) loads one team file at a time and does the planning maths in the browser.

The hosted demo is rebuilt by a GitHub Actions workflow that clones the data, runs both scripts and publishes the
app. Nothing derived from the data is committed to the repository, as the data license requires.

Two details mattered more than expected:

- **Roles.** The feed's player order matches top, jungle, mid, bot, support only about 75% of the time. Roles are
  inferred in three passes: a champion-role prior from that order, each player's main role over all their games,
  then for every game the one assignment of five roles that best fits the five players' histories.
- **Draft order.** In the 2026 LEC and LCS data the first-pick team is red in about 40% of games ("first
  selection"), so the code never assumes blue picks first. Every draft statistic is split by first or second
  pick, not only by side.

## What it computes

- **By game number.** For games 1 to 5: picks, bans, bans received, wins, side and first-pick rate.
- **Spend or save.** For every champion a team played in multi-game series, the game number where they first
  used it in each series. A champion first used in game 1 in most of those series is "spent"; one first used in
  game 3 or later is "saved". A claim needs at least 3 series behind it.
- **Player pools.** Each player's champions with games and wins, pool depth, and how often they leave their top
  five as the series goes on.
- **Denial value.** For each champion still open, the sum over the opponent's players of their share of games on
  it. Picking it (by either team) takes that much of their comfort away for the rest of the series. The same sum
  over our players is the cost of using it ourselves now.
- **How to beat them.** Win-loss records with and against each champion, by side, by pick order and after losing
  game 1. A line is shown only when the record sits at least one standard error away from the team's own average
  win rate (binomial z-score, at least 4 games). It is tagged "strong" at two standard errors and 8 or more
  games. Side and pick order use a two-proportion test.
- **Live options.** During a real draft each next action gets up to 8 options, scored from the open-role
  players' comfort, the opponent's history at this game number, denial value while games remain and the records
  above. Each option lists the evidence behind its score.

## How it answers the two questions

- *What repeats for this opponent?* The Scout tab leads with key tendencies in plain words, each with its sample
  ("T1 saves Jax for game 3+: 7 of 10 series"), then the full tables by game number and by draft slot.
- *How does their draft shift in games 3, 4 and 5?* The by-game-number view, the spend/save list and the
  off-pool rate by game show it directly. The planner shows, for each game of our plan, what the opponent
  historically does at that game number with the champions that are still open.

## Limits

- A win-loss record with a champion includes everything else in those games. The tool shows it as a pointer for
  prep, never as a cause, and always with its sample.
- Samples are small. Most teams have 11 to 65 series in the data, so most lines rest on 5 to 30 games. That is why
  every number carries its count and why thresholds hide anything thinner.
- Patches change. The window switch (last 15 series or all of 2025-2026) is the coach's way to trade sample size
  for recency.
- No live win-rate prediction. With this much data a predicted win rate for a draft would look precise and not
  be. I left it out rather than show a number I could not stand behind.
- Following Riot's policy, the tool highlights options and their evidence; the coach makes every decision.
