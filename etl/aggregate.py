"""Turn build/games.jsonl into the aggregate JSON the web app loads.

Output (web/public/data/): index.json and teams/<team_id>.json. They hold counts, rates and pools only, no
per-game draft records, so the hosted demo stays within the data licence's "results and statistics" use.
Run `python3 etl/aggregate.py --with-series-log` for a local build that also keeps each team's series log
(web/data-local/, outside public/ so it never reaches a production build; the dev server serves it).
Both outputs are derived from the licensed feeds and are git-ignored.

Draft order: seq 1-6 bans F S F S F S, 7-12 picks F1 S1 S2 F2 F3 S3, 13-16 bans S F S F, 17-20 picks
S4 F4 F5 S5, where F is the first-pick team. Up to 2025 that was always blue; in the 2026 LEC and LCS data
(the "first selection" rule) red has first pick in about 40% of games, so this code never equates F with blue.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from itertools import permutations
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "build" / "games.jsonl"
RECENT_SERIES = 15
ROLES = ("TOP", "JNG", "MID", "BOT", "SUP")


@dataclass
class Game:
    raw: dict
    team: dict
    opp: dict

    @property
    def number(self) -> int:
        return self.raw["game_number"]

    @property
    def side(self) -> str:
        return self.team["side"]

    @property
    def full_draft(self) -> bool:
        return len(self.raw["draft"]) == 20

    @property
    def first_pick(self) -> bool:
        """Only meaningful for a full draft (seq 7 is the first pick)."""
        return self.full_draft and self.raw["draft"][6]["team"] == self.team["id"]

    def lineup_champs(self, side: dict) -> list[str]:
        return [p["champ"] for p in side["players"]]

    def picks(self, team_id: str) -> list[dict]:
        return [a for a in self.raw["draft"] if a["type"] == "pick" and a["team"] == team_id]

    def bans(self, team_id: str) -> list[dict]:
        return [a for a in self.raw["draft"] if a["type"] == "ban" and a["team"] == team_id]


@dataclass
class Series:
    series_id: str
    date: str
    event: str
    stage: str
    format: str
    opponent: dict
    games: list[Game] = field(default_factory=list)

    @property
    def won(self) -> bool | None:
        wins = sum(g.team["won"] for g in self.games)
        losses = sum(g.opp["won"] for g in self.games)
        return None if wins == losses else wins > losses


def load_games() -> list[dict]:
    if not SRC.exists():
        sys.exit(f"{SRC} not found: run etl/extract.py first")
    games = [json.loads(line) for line in SRC.open(encoding="utf-8")]
    # Keep finished games with two full lineups: they carry the result and the picks. Draft-order stats
    # (bans, first pick, slots) use only the games whose draft has all 20 actions.
    keep = [g for g in games if g["finished"] and len(g["teams"]) == 2
            and all(len(t["players"]) == 5 for t in g["teams"])]
    full = sum(len(g["draft"]) == 20 for g in keep)
    print(f"games: {len(games)} read, {len(keep)} kept (finished, 5v5 lineups), {full} with a full draft")
    infer_roles(keep)
    return keep


def infer_roles(games: list[dict]) -> None:
    """Give every player a role. The feed's player order matches top/jng/mid/bot/sup only about 75% of
    the time, so: champion-role prior from that order -> each player's main role over all their games ->
    per game, the unique role assignment that best fits the players' histories."""
    prior: dict[str, Counter] = defaultdict(Counter)
    for g in games:
        for t in g["teams"]:
            for p in t["players"]:
                prior[p["champ"]][p["role"]] += 1
    player_score: dict[str, Counter] = defaultdict(Counter)
    for g in games:
        for t in g["teams"]:
            for p in t["players"]:
                total = sum(prior[p["champ"]].values())
                for role in ROLES:
                    player_score[p["id"]][role] += prior[p["champ"]][role] / total
    for g in games:
        for t in g["teams"]:
            ps = t["players"]
            best = max(permutations(ROLES), key=lambda perm: sum(
                player_score[p["id"]][r] for p, r in zip(ps, perm)))
            for p, r in zip(ps, best):
                p["role"] = r


def series_by_team(games: list[dict]) -> dict[str, list[Series]]:
    out: dict[str, dict[str, Series]] = defaultdict(dict)
    for g in games:
        for i, team in enumerate(g["teams"]):
            opp = g["teams"][1 - i]
            s = out[team["id"]].get(g["series_id"])
            if s is None:
                s = Series(g["series_id"], g["date"], g["event"], g["stage"], g["format"],
                           {"id": opp["id"], "name": opp["name"]})
                out[team["id"]][g["series_id"]] = s
            s.games.append(Game(g, team, opp))
    result = {}
    for team_id, by_id in out.items():
        series = sorted(by_id.values(), key=lambda s: s.date)
        for s in series:
            s.games.sort(key=lambda g: g.number)
            s.date = s.games[0].raw["date"]
        result[team_id] = series
    return result


PICK_SLOT = {7: "F1", 8: "S1", 9: "S2", 10: "F2", 11: "F3", 12: "S3", 17: "S4", 18: "F4", 19: "F5", 20: "S5"}


def ban_phase(seq: int) -> int:
    return 1 if seq <= 6 else 2


def team_window(team_id: str, series: list[Series]) -> dict:
    games = [g for s in series for g in s.games]
    names = {s.opponent["id"]: s.opponent["name"] for s in series}  # latest name wins (series are by date)
    drafts = [g for g in games if g.full_draft]
    by_number: dict[int, dict] = {}
    for n in range(1, 6):
        gs = [g for g in games if g.number == n]
        if not gs:
            continue
        ds = [g for g in gs if g.full_draft]
        by_number[n] = {
            "games": len(gs),  # denominator for wins, blue and picks
            "drafts": len(ds),  # denominator for first pick and bans
            "wins": sum(g.team["won"] for g in gs),
            "blue": sum(g.side == "blue" for g in gs),
            "first_pick": sum(g.first_pick for g in ds),
            "picks": Counter(c for g in gs for c in g.lineup_champs(g.team)).most_common(),
            "bans": Counter(a["champ"] for g in ds for a in g.bans(team_id)).most_common(),
            "banned_against": Counter(a["champ"] for g in ds for a in g.bans(g.opp["id"])).most_common(),
        }

    # Their first pick when they hold first pick, and first-phase bans by draft position.
    f1 = Counter(a["champ"] for g in drafts if g.first_pick for a in g.picks(team_id) if a["seq"] == 7)
    phase1_bans = {pos: Counter(a["champ"] for g in drafts if g.first_pick == (pos == "first")
                                for a in g.bans(team_id) if ban_phase(a["seq"]) == 1).most_common(12)
                   for pos in ("first", "second")}
    side_vs_pick = Counter(f"{g.side}-{'first' if g.first_pick else 'second'}" for g in drafts)
    # Picks by draft slot: what they lock early (F1/F2-F3, S1-S2) versus leave to the last rotation.
    by_slot = {slot: Counter(a["champ"] for g in drafts for a in g.picks(team_id)
                             if PICK_SLOT.get(a["seq"]) == slot).most_common(8)
               for slot in PICK_SLOT.values()}

    # Spend vs save: for each champion the team picked, the game number of its first pick in each series.
    first_use: dict[str, Counter] = defaultdict(Counter)
    multi = [s for s in series if len(s.games) >= 2]
    for s in multi:
        seen: set[str] = set()
        for g in s.games:
            for c in g.lineup_champs(g.team):
                if c not in seen:
                    seen.add(c)
                    first_use[c][g.number] += 1
    spend_save = sorted(
        ({"champ": c, "series": sum(cnt.values()), "by_game": dict(sorted(cnt.items())),
          "g1_share": round(cnt[1] / sum(cnt.values()), 3),
          "late_share": round(sum(v for k, v in cnt.items() if k >= 3) / sum(cnt.values()), 3)}
         for c, cnt in first_use.items()),
        key=lambda x: -x["series"])

    return {
        "series": len(series),
        "games": len(games),
        "series_won": sum(1 for s in series if s.won is True),
        "series_lost": sum(1 for s in series if s.won is False),  # the rest have a tied or partial record
        "games_won": sum(g.team["won"] for g in games),
        "from": series[0].date if series else None,
        "to": series[-1].date if series else None,
        "events": sorted({s.event for s in series}),
        "opponents": [{"id": i, "name": names[i], "series": n} for i, n in
                      Counter(s.opponent["id"] for s in series).most_common()],
        "by_game_number": by_number,
        "first_pick_f1": f1.most_common(15),
        "phase1_bans": phase1_bans,
        "side_vs_pick": dict(side_vs_pick),
        "picks_by_slot": by_slot,
        "spend_save": spend_save[:60],
        "players": player_pools(team_id, series),
    }


def player_pools(team_id: str, series: list[Series]) -> list[dict]:
    """Champion pools of the players in the team's latest lineup, with Fearless depth per series."""
    if not series:
        return []
    latest = sorted(series[-1].games[-1].team["players"], key=lambda q: ROLES.index(q["role"]))
    pools = []
    for p in latest:
        champs: dict[str, list[int]] = defaultdict(lambda: [0, 0])  # champ -> [games, wins]
        late_offpool = Counter()  # game number -> games where the champ was outside the player's top 5
        appearances = []
        for s in series:
            for g in s.games:
                for q in g.team["players"]:
                    if q["id"] == p["id"]:
                        champs[q["champ"]][0] += 1
                        champs[q["champ"]][1] += int(g.team["won"])
                        appearances.append((g.number, q["champ"]))
        ranked = sorted(champs.items(), key=lambda kv: (-kv[1][0], kv[0]))
        top5 = {c for c, _ in ranked[:5]}
        by_number = Counter(n for n, _ in appearances)
        for n, c in appearances:
            if c not in top5:
                late_offpool[n] += 1
        pools.append({
            "id": p["id"], "name": p["name"], "role": p["role"],
            "games": sum(v[0] for v in champs.values()),
            "champs": [{"champ": c, "games": v[0], "wins": v[1]} for c, v in ranked],
            "unique": len(champs),
            "depth": sum(1 for v in champs.values() if v[0] >= 2),
            "offpool_by_game": {n: [late_offpool[n], by_number[n]] for n in sorted(by_number)},
        })
    return pools


def champion_meta(games: list[dict]) -> dict:
    stats: dict[str, dict] = defaultdict(lambda: {"picks": 0, "bans": 0, "wins": 0, "roles": Counter()})
    drafts = [g for g in games if len(g["draft"]) == 20]
    for g in drafts:
        winners = {t["id"] for t in g["teams"] if t["won"]}
        for a in g["draft"]:
            st = stats[a["champ"]]
            if a["type"] == "ban":
                st["bans"] += 1
            else:
                st["picks"] += 1
                st["wins"] += int(a["team"] in winners)
        for t in g["teams"]:
            for p in t["players"]:
                stats[p["champ"]]["roles"][p["role"]] += 1
    n = len(drafts)
    return {c: {"picks": s["picks"], "bans": s["bans"], "wins": s["wins"],
                "presence": round((s["picks"] + s["bans"]) / n, 4),
                "roles": dict(s["roles"].most_common())}
            for c, s in sorted(stats.items())}


def series_log(team_id: str, series: list[Series]) -> list[dict]:
    return [{
        "series_id": s.series_id, "date": s.date, "event": s.event, "stage": s.stage,
        "opponent": s.opponent, "won": s.won,
        "games": [{"n": g.number, "side": g.side, "won": g.team["won"], "patch": g.raw["patch"],
                   "draft": [{"seq": a["seq"], "type": a["type"], "us": a["team"] == team_id,
                              "champ": a["champ"]} for a in g.raw["draft"]],
                   "lineup": [{"name": q["name"], "role": q["role"], "champ": q["champ"]}
                              for q in g.team["players"]],
                   "opp_lineup": [{"name": q["name"], "role": q["role"], "champ": q["champ"]}
                                  for q in g.opp["players"]]}
                  for g in s.games]} for s in series]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--with-series-log", action="store_true")
    args = parser.parse_args()
    out = ROOT / "web" / ("data-local" if args.with_series_log else "public/data")
    games = load_games()
    teams = series_by_team(games)
    if out.exists():
        shutil.rmtree(out)
    (out / "teams").mkdir(parents=True)
    index = []
    for team_id, series in teams.items():
        name = series[-1].games[-1].team["name"]
        profile = {"id": team_id, "name": name,
                   "windows": {"recent": team_window(team_id, series[-RECENT_SERIES:]),
                               "all": team_window(team_id, series)}}
        if args.with_series_log:
            profile["series_log"] = series_log(team_id, series)
        (out / "teams" / f"{team_id}.json").write_text(json.dumps(profile, ensure_ascii=False),
                                                     encoding="utf-8")
        index.append({"id": team_id, "name": name, "series": len(series),
                      "league": series[-1].event.split(" - ")[0],
                      "last": series[-1].date, "events": sorted({s.event for s in series})})
    index.sort(key=lambda t: t["last"], reverse=True)
    meta = {"teams": index, "champions": champion_meta(games), "games": len(games),
            "recent_series": RECENT_SERIES, "local": args.with_series_log}
    (out / "index.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    print(f"{len(index)} teams -> {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
