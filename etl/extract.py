"""Extract every LoL game's draft, sides, result and lineup from the GRID starter feeds.

Reads the licensed GRID data from STL_DATA_DIR (default ../stl-hackathon-2026-grid-starter) and writes
build/games.jsonl, one line per game. build/ is git-ignored: it holds data derived from the feeds.

Usage: python3 etl/extract.py [--workers 4]
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from compression import zstd

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("STL_DATA_DIR", ROOT.parent / "stl-hackathon-2026-grid-starter"))
OUT = ROOT / "build" / "games.jsonl"
FULL_STATE_MARK = '"includesFullState":true'
ROLES = ("TOP", "JNG", "MID", "BOT", "SUP")


def last_full_states(path: Path) -> list[dict]:
    """Final full seriesState of each feed session in the file (most files have one session)."""
    sessions: list[dict] = []
    current = None
    with zstd.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            if '"grid-started-feed"' in line and current is not None:
                sessions.append(current)
                current = None
            if FULL_STATE_MARK not in line:
                continue
            for event in json.loads(line)["events"]:
                if event.get("includesFullState") and event.get("seriesState"):
                    current = event["seriesState"]
    if current is not None:
        sessions.append(current)
    return sessions


def game_record(series: dict, meta: dict, game: dict, number: int) -> dict:
    teams = []
    for team in game["teams"]:
        players = [
            {
                "id": p["id"],
                "name": p["name"].strip(),
                "champ": (p.get("character") or {}).get("name"),
                "role": ROLES[i] if i < len(ROLES) else None,
            }
            for i, p in enumerate(team.get("players") or [])
        ]
        teams.append({"id": team["id"], "name": team["name"], "side": team.get("side"),
                      "won": bool(team.get("won")), "players": players})
    draft = [
        {"seq": a["sequenceNumber"], "type": a["type"], "team": a["drafter"]["id"],
         "champ": a["draftable"]["name"]}
        for a in sorted(game.get("draftActions") or [], key=lambda a: a["sequenceNumber"])
    ]
    return {
        "series_id": series["id"],
        "event": meta["event"],
        "stage": meta["stage"],
        "date": game.get("startedAt") or meta["scheduled_start"],
        "format": (series.get("format") or ""),
        "series_valid": bool(series.get("valid")),
        "game_id": game["id"],
        "game_number": number,
        "patch": (game.get("titleVersion") or {}).get("name"),
        "finished": bool(game.get("finished")),
        "teams": teams,
        "draft": draft,
    }


def extract_series(meta: dict) -> list[dict]:
    sessions = last_full_states(DATA_DIR / meta["file"])
    # Two-session files: the first session holds the real match (see the data README caveats).
    series = next((s for s in sessions if s.get("games")), None)
    if series is None:
        return []
    return [game_record(series, meta, g, i + 1) for i, g in enumerate(series["games"])]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    index = DATA_DIR / "lol" / "series.csv"
    if not index.exists():
        print(f"GRID data not found at {DATA_DIR} (set STL_DATA_DIR)", file=sys.stderr)
        return 1
    rows = list(csv.DictReader(index.open(encoding="utf-8")))
    OUT.parent.mkdir(exist_ok=True)
    games = 0
    with ProcessPoolExecutor(max_workers=args.workers) as pool, OUT.open("w", encoding="utf-8") as out:
        for records in pool.map(extract_series, rows, chunksize=4):
            for r in records:
                out.write(json.dumps(r, ensure_ascii=False) + "\n")
                games += 1
    print(f"{len(rows)} series -> {games} games -> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
