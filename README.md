# Fearless Ledger

Series prep for League of Legends coaches under Fearless Draft. Built for the Cloud9 x JetBrains
"Sky's The Limit" hackathon (Category 2: macro scouting and draft management).

Most draft tools look at one game. Under Fearless, a champion picked in game 1 is gone for both teams for the rest
of the series, so the real question is how a whole Bo3 or Bo5 plays out. Fearless Ledger answers it from GRID match
data:

- **Scout an opponent by game number.** What they pick, ban and lose to bans in games 1 to 5; what they spend in
  game 1 and what they save for game 3 and later; first-pick priorities; phase-1 bans with first or second
  selection; each player's pool, its depth and how often they leave their top five late in a series.
- **Plan the series.** Lay out picks and bans for every game. Champions picked earlier lock automatically, wasted
  bans and repeats are flagged, and for each game you see what the opponent historically does at that game number,
  what each player has left, and the **denial value** of every champion: how much of the opponent's comfort a pick
  removes for the rest of the series, next to what it costs your own pools.
- **Run the draft live.** Log the real draft action by action. Picks fill the lineup and lock for later games,
  and each next action gets options with their evidence: what the opponent's open-role players and their game-N
  history point to, or what our players can still play and how much it takes away from the opponent.
- **Print the series sheet.** One A4 page: the opponent's tendencies, their picks and bans by game number, player
  pools, denial targets and our plan for every game.
- **Self-scout.** The same views for your own team, to see where you are predictable.

Every number shows its sample ("4 of 5 series"). The tool highlights options; the coach decides.

## Run it

The hosted demo is rebuilt on every push by `.github/workflows/pages.yml`, which clones the data, runs the
ETL and publishes the app with aggregate statistics only.

Locally:

The match data is licensed to hackathon participants and is not in this repository.

```bash
git clone https://github.com/cloud9esports/stl-hackathon-2026-grid-starter ../stl-hackathon-2026-grid-starter
python3 etl/extract.py            # needs Python 3.14 (compression.zstd); writes build/games.jsonl
python3 etl/aggregate.py          # aggregates for the app -> web/public/data/
cd web && npm install && npm run dev
```

`STL_DATA_DIR` points the ETL at another copy of the data. `python3 etl/aggregate.py --with-series-log` also
builds a local-only view of every series' draft (web/data-local/, served by the dev server, never bundled).

## Data and licenses

- Match data: GRID esports data from the hackathon's starter repository, used under its license for this
  hackathon only. Nothing derived from it is committed here; the hosted demo shows aggregate statistics only.
- Champion icons: Riot Data Dragon.
- Fearless Ledger isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone
  officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are
  trademarks or registered trademarks of Riot Games, Inc.
- Code: MIT, see LICENSE.
