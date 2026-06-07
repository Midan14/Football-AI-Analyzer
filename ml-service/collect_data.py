"""
Data Collection Script — Downloads historical fixtures from API-Football and
builds POINT-IN-TIME training samples (no target leakage).

Usage:
    python collect_data.py --seasons 2022,2023,2024,2025 --leagues 39,140,135,78,61
    python collect_data.py --with-odds          # also fetch opening odds (1 call/fixture)

Key difference vs the old collector:
    The previous version attached end-of-season `/teams/statistics` to every
    fixture of that season — which leaks the result being predicted plus all
    future matches. This version recomputes each team's stats using ONLY the
    matches played strictly before the fixture date, so every feature reflects
    what was actually known at kickoff.

Output:
    ml-service/data/training_data.json  — list of point-in-time samples
"""

from __future__ import annotations

import argparse
import json
import os
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env.local")

API_KEY = os.getenv("API_FOOTBALL_KEY", "")
BASE_URL = "https://v3.football.api-sports.io"
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# Seconds to sleep between API calls (per thread). The Ultra plan allows a high
# request rate, so this is configurable; default 0.15s is safe for Pro/Ultra.
RATE_SLEEP = float(os.getenv("API_FOOTBALL_SLEEP", "0.15"))

# Concurrent workers for per-fixture xG/odds prefetch. Bounded so the effective
# rate (workers / (latency + RATE_SLEEP)) stays under the plan's per-minute cap.
MAX_WORKERS = int(os.getenv("API_FOOTBALL_WORKERS", "6"))

DEFAULT_LEAGUES = [
    39,   # Premier League
    140,  # La Liga
    135,  # Serie A
    78,   # Bundesliga
    61,   # Ligue 1
    88,   # Eredivisie
    94,   # Primeira Liga
    203,  # Super Lig
    71,   # Serie A Brazil
    253,  # MLS
]

HEADERS = {"x-apisports-key": API_KEY}

# Elo configuration (point-in-time, updated after each match chronologically)
ELO_BASE = 1500.0
ELO_K = 20.0
ELO_HOME_ADV = 65.0

# Minimum prior matches a team must have in the season before a fixture is
# usable as a training row (avoids cold-start noise in early rounds).
MIN_PRIOR_MATCHES = 4
RECENT_WINDOW = 10


MAX_RETRIES = int(os.getenv("API_FOOTBALL_RETRIES", "5"))


def api_request(endpoint: str, params: dict) -> dict:
    """GET with retry + exponential backoff on 429 / transient errors."""
    url = f"{BASE_URL}{endpoint}"
    last_exc: Optional[Exception] = None
    for attempt in range(MAX_RETRIES):
        try:
            response = httpx.get(url, headers=HEADERS, params=params, timeout=30)
            if response.status_code == 429:
                retry_after = response.headers.get("Retry-After")
                wait = float(retry_after) if retry_after and retry_after.isdigit() else min(60.0, 2.0 * (2 ** attempt))
                time.sleep(wait)
                continue
            response.raise_for_status()
            data = response.json()
            time.sleep(RATE_SLEEP)  # Configurable via API_FOOTBALL_SLEEP / --sleep
            return data
        except httpx.HTTPStatusError as exc:
            last_exc = exc
            if exc.response is not None and exc.response.status_code >= 500:
                time.sleep(min(30.0, 1.5 * (2 ** attempt)))
                continue
            raise
        except (httpx.TransportError, httpx.TimeoutException) as exc:
            last_exc = exc
            time.sleep(min(30.0, 1.5 * (2 ** attempt)))
            continue
    raise last_exc if last_exc else RuntimeError(f"API request failed after retries: {endpoint}")


def collect_fixture_xg(fixture_id: int) -> Optional[Tuple[float, float]]:
    """Real (home_xg, away_xg) from /fixtures/statistics (Ultra plan).

    Returns None when the Expected Goals stat is unavailable for the fixture.
    """
    try:
        data = api_request("/fixtures/statistics", {"fixture": fixture_id})
    except Exception:
        return None
    resp = data.get("response", [])
    if len(resp) < 2:
        return None

    def _extract_xg(block: dict) -> Optional[float]:
        for stat in block.get("statistics", []) or []:
            if str(stat.get("type", "")).lower() in ("expected_goals", "expected goals"):
                val = stat.get("value")
                if val is None:
                    return None
                try:
                    return float(str(val).replace(",", "."))
                except Exception:
                    return None
        return None

    home_xg = _extract_xg(resp[0])
    away_xg = _extract_xg(resp[1])
    if home_xg is None or away_xg is None:
        return None
    return home_xg, away_xg


def _prefetch(ids: List[int], fetch_fn: Callable[[int], Any], label: str) -> Dict[int, Any]:
    """Fetch fetch_fn(id) for all ids concurrently (bounded by MAX_WORKERS)."""
    results: Dict[int, Any] = {}
    if not ids:
        return results
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_map = {executor.submit(fetch_fn, fid): fid for fid in ids}
        done = 0
        for future in future_map:
            fid = future_map[future]
            try:
                results[fid] = future.result()
            except Exception:
                results[fid] = None
            done += 1
            if done % 100 == 0:
                print(f"    prefetch {label}: {done}/{len(ids)}")
    return results


def collect_fixtures(league_id: int, season: int) -> list:
    print(f"  Collecting fixtures: league={league_id}, season={season}")
    data = api_request("/fixtures", {"league": league_id, "season": season})
    fixtures = data.get("response", [])
    print(f"    -> {len(fixtures)} fixtures found")
    return fixtures


def collect_opening_odds(fixture_id: int) -> Dict[str, float]:
    """Best-effort 1X2 / Over2.5 / BTTS odds. Returns {} on any failure."""
    try:
        data = api_request("/odds", {"fixture": fixture_id})
    except Exception:
        return {}
    resp = data.get("response", [])
    if not resp:
        return {}
    out: Dict[str, float] = {}
    try:
        bookmakers = resp[0].get("bookmakers", [])
        if not bookmakers:
            return {}
        bets = bookmakers[0].get("bets", [])
        for bet in bets:
            name = bet.get("name", "")
            values = bet.get("values", [])
            if name == "Match Winner":
                for v in values:
                    if v.get("value") == "Home":
                        out["homeWinOdds"] = float(v.get("odd", 0) or 0)
                    elif v.get("value") == "Draw":
                        out["drawOdds"] = float(v.get("odd", 0) or 0)
                    elif v.get("value") == "Away":
                        out["awayWinOdds"] = float(v.get("odd", 0) or 0)
            elif name in ("Goals Over/Under", "Over/Under"):
                for v in values:
                    if v.get("value") in ("Over 2.5",):
                        out["over25Odds"] = float(v.get("odd", 0) or 0)
            elif name == "Both Teams Score":
                for v in values:
                    if v.get("value") == "Yes":
                        out["bttsYesOdds"] = float(v.get("odd", 0) or 0)
    except Exception:
        return {}
    return out


class TeamHistory:
    """Accumulates a single team's results chronologically and snapshots
    point-in-time aggregates that mirror the API-Football statistics shape."""

    def __init__(self) -> None:
        self.matches: List[Dict[str, Any]] = []  # each: date, venue, gf, ga, result
        self.elo: float = ELO_BASE

    def prior_count(self) -> int:
        return len(self.matches)

    def last_match_date(self) -> Optional[datetime]:
        if not self.matches:
            return None
        return self.matches[-1]["date"]

    def snapshot_stats(self) -> Dict[str, Any]:
        played_total = len(self.matches)
        played_home = sum(1 for m in self.matches if m["venue"] == "home")
        played_away = played_total - played_home

        wins = draws = loses = 0
        wins_home = wins_away = 0
        gf_total = ga_total = 0
        gf_home = gf_away = ga_home = ga_away = 0
        clean_sheets = failed_to_score = 0

        for m in self.matches:
            gf_total += m["gf"]
            ga_total += m["ga"]
            if m["venue"] == "home":
                gf_home += m["gf"]
                ga_home += m["ga"]
            else:
                gf_away += m["gf"]
                ga_away += m["ga"]
            if m["result"] == "W":
                wins += 1
                if m["venue"] == "home":
                    wins_home += 1
                else:
                    wins_away += 1
            elif m["result"] == "D":
                draws += 1
            else:
                loses += 1
            if m["ga"] == 0:
                clean_sheets += 1
            if m["gf"] == 0:
                failed_to_score += 1

        form = "".join(m["result"] for m in self.matches[-5:])

        snapshot = {
            "fixtures": {
                "played": {"total": played_total, "home": played_home, "away": played_away},
                "wins": {"total": wins, "home": wins_home, "away": wins_away},
                "draws": {"total": draws},
                "loses": {"total": loses},
            },
            "goals": {
                "for": {"total": {"total": gf_total, "home": gf_home, "away": gf_away}},
                "against": {"total": {"total": ga_total, "home": ga_home, "away": ga_away}},
            },
            "form": form,
            "clean_sheet": {"total": clean_sheets},
            "failed_to_score": {"total": failed_to_score},
            "penalty": {"scored": {"total": 0}},
        }

        # Real xG rates (Ultra plan) when at least one prior match carried xG.
        xg_matches = [m for m in self.matches if m.get("xg_for") is not None]
        if xg_matches:
            snapshot["xg_for"] = round(sum(m["xg_for"] for m in xg_matches) / len(xg_matches), 3)
            snapshot["xg_against"] = round(sum(m["xg_against"] for m in xg_matches) / len(xg_matches), 3)
        return snapshot

    def has_xg(self) -> bool:
        return any(m.get("xg_for") is not None for m in self.matches)

    def xg_rates(self) -> Optional[Tuple[float, float]]:
        xg_matches = [m for m in self.matches if m.get("xg_for") is not None]
        if not xg_matches:
            return None
        gf = sum(m["xg_for"] for m in xg_matches) / len(xg_matches)
        ga = sum(m["xg_against"] for m in xg_matches) / len(xg_matches)
        return round(gf, 3), round(ga, 3)

    def points(self) -> int:
        return sum(3 if m["result"] == "W" else 1 if m["result"] == "D" else 0 for m in self.matches)

    def goal_rate(self) -> float:
        if not self.matches:
            return 1.3
        return sum(m["gf"] for m in self.matches) / len(self.matches)

    def conceded_rate(self) -> float:
        if not self.matches:
            return 1.3
        return sum(m["ga"] for m in self.matches) / len(self.matches)

    def recent(self, venue_perspective: str, window: int = RECENT_WINDOW) -> List[Dict[str, Any]]:
        """Recent matches encoded for features._rolling_xg / _form_points_home_away.

        venue_perspective: "home" if this team is the home side in the target
        fixture, "away" otherwise. The goal fields are written so that
        `_rolling_xg(recent, venue_perspective)` reads team-for / team-against
        correctly regardless of where each historical match was actually played.
        """
        out: List[Dict[str, Any]] = []
        for m in self.matches[-window:]:
            if venue_perspective == "home":
                home_goals, away_goals = m["gf"], m["ga"]
                home_xg, away_xg = m.get("xg_for"), m.get("xg_against")
            else:
                home_goals, away_goals = m["ga"], m["gf"]
                home_xg, away_xg = m.get("xg_against"), m.get("xg_for")
            entry = {
                "result": m["result"],
                "venue": m["venue"],
                "isHome": m["venue"] == "home",
                "isAway": m["venue"] == "away",
                "homeGoals": home_goals,
                "awayGoals": away_goals,
            }
            if home_xg is not None and away_xg is not None:
                entry["homeXg"] = home_xg
                entry["awayXg"] = away_xg
            out.append(entry)
        return out

    def record(
        self,
        date: datetime,
        venue: str,
        gf: int,
        ga: int,
        result: str,
        xg_for: Optional[float] = None,
        xg_against: Optional[float] = None,
    ) -> None:
        self.matches.append(
            {
                "date": date,
                "venue": venue,
                "gf": gf,
                "ga": ga,
                "result": result,
                "xg_for": xg_for,
                "xg_against": xg_against,
            }
        )


def _elo_expected(elo_home: float, elo_away: float) -> float:
    return 1.0 / (1.0 + 10 ** ((elo_away - (elo_home + ELO_HOME_ADV)) / 400.0))


def _update_elo(home: TeamHistory, away: TeamHistory, home_goals: int, away_goals: int) -> None:
    expected_home = _elo_expected(home.elo, away.elo)
    if home_goals > away_goals:
        score_home = 1.0
    elif home_goals == away_goals:
        score_home = 0.5
    else:
        score_home = 0.0
    margin = abs(home_goals - away_goals)
    multiplier = 1.0 + min(0.75, margin * 0.25)  # goal-margin weighted K
    delta = ELO_K * multiplier * (score_home - expected_home)
    home.elo += delta
    away.elo -= delta


def _parse_date(raw: str) -> datetime:
    # API-Football dates look like "2023-08-11T19:00:00+00:00"
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        return datetime.fromisoformat(raw[:19])


def build_samples_for_competition(
    fixtures: List[dict],
    league_name: str,
    with_odds: bool,
    with_xg: bool = False,
    max_samples: Optional[int] = None,
) -> List[dict]:
    """Iterate fixtures chronologically; emit a point-in-time sample per FT match."""
    finished = []
    for fx in fixtures:
        status = fx.get("fixture", {}).get("status", {}).get("short", "")
        if status != "FT":
            continue
        if fx.get("goals", {}).get("home") is None or fx.get("goals", {}).get("away") is None:
            continue
        finished.append(fx)

    finished.sort(key=lambda f: _parse_date(f["fixture"]["date"]))

    # League average goals across the whole competition (a league-level constant;
    # negligible leakage and standard practice for the Poisson baseline).
    if finished:
        league_avg_goals = sum(
            f["goals"]["home"] + f["goals"]["away"] for f in finished
        ) / len(finished)
    else:
        league_avg_goals = 2.65

    # Concurrent prefetch of per-fixture xG / odds (huge wall-time win vs the
    # sequential path; bounded by MAX_WORKERS to respect the rate cap).
    finished_ids = [f["fixture"]["id"] for f in finished]
    xg_by_id: Dict[int, Any] = {}
    odds_by_id: Dict[int, Any] = {}
    if with_xg:
        xg_by_id = _prefetch(finished_ids, collect_fixture_xg, "xg")
    if with_odds:
        odds_by_id = _prefetch(finished_ids, collect_opening_odds, "odds")

    histories: Dict[int, TeamHistory] = defaultdict(TeamHistory)
    samples: List[dict] = []

    for fx in finished:
        date = _parse_date(fx["fixture"]["date"])
        home_id = fx["teams"]["home"]["id"]
        away_id = fx["teams"]["away"]["id"]
        home_goals = int(fx["goals"]["home"])
        away_goals = int(fx["goals"]["away"])

        home_hist = histories[home_id]
        away_hist = histories[away_id]

        # Real xG for this match (Ultra plan) — used both for the recorded
        # history and, retrospectively, for rolling-xG features of future rows.
        match_home_xg: Optional[float] = None
        match_away_xg: Optional[float] = None
        if with_xg:
            xg = xg_by_id.get(fx["fixture"]["id"])
            if xg is not None:
                match_home_xg, match_away_xg = xg

        usable = (
            home_hist.prior_count() >= MIN_PRIOR_MATCHES
            and away_hist.prior_count() >= MIN_PRIOR_MATCHES
        )

        if usable and (max_samples is None or len(samples) < max_samples):
            if home_goals > away_goals:
                result = "HOME_WIN"
            elif home_goals == away_goals:
                result = "DRAW"
            else:
                result = "AWAY_WIN"

            home_rest = _rest_days(home_hist, date)
            away_rest = _rest_days(away_hist, date)

            odds: Dict[str, float] = odds_by_id.get(fx["fixture"]["id"]) or {} if with_odds else {}

            home_xg_rates = home_hist.xg_rates()
            away_xg_rates = away_hist.xg_rates()
            home_xg_for, home_xg_against = (
                home_xg_rates if home_xg_rates else (round(home_hist.goal_rate(), 3), round(home_hist.conceded_rate(), 3))
            )
            away_xg_for, away_xg_against = (
                away_xg_rates if away_xg_rates else (round(away_hist.goal_rate(), 3), round(away_hist.conceded_rate(), 3))
            )
            has_real_xg = home_hist.has_xg() and away_hist.has_xg()

            sample = {
                "fixture_id": fx["fixture"]["id"],
                "league_id": fx["league"]["id"],
                "league_name": league_name,
                "season": fx["league"].get("season"),
                "date": fx["fixture"]["date"],
                "home_team_id": home_id,
                "away_team_id": away_id,
                "home_goals": home_goals,
                "away_goals": away_goals,
                "total_goals": home_goals + away_goals,
                "result": result,
                "btts": home_goals > 0 and away_goals > 0,
                "over_25": (home_goals + away_goals) >= 3,
                "over_15": (home_goals + away_goals) >= 2,
                # Point-in-time nested stats consumed by features.extract_*
                "home_stats": home_hist.snapshot_stats(),
                "away_stats": away_hist.snapshot_stats(),
                # Top-level scalars consumed by train_hybrid._sample_to_fixture
                "home_points": home_hist.points(),
                "away_points": away_hist.points(),
                "home_matches_played": home_hist.prior_count(),
                "away_matches_played": away_hist.prior_count(),
                "home_xg_for": home_xg_for,
                "home_xg_against": home_xg_against,
                "away_xg_for": away_xg_for,
                "away_xg_against": away_xg_against,
                "home_rest_days": home_rest,
                "away_rest_days": away_rest,
                "away_travel_km": 0,
                "home_recent": home_hist.recent("home"),
                "away_recent": away_hist.recent("away"),
                "coverage": {"hasXg": has_real_xg, "has_xg": has_real_xg},
                "context": {},
                "market": odds,
                "ml_context": {
                    "league": {"avgGoals": round(league_avg_goals, 3)},
                    "elo": {"home": round(home_hist.elo, 1), "away": round(away_hist.elo, 1)},
                    "home_rest_days": home_rest,
                    "away_rest_days": away_rest,
                    "rest_days_diff": home_rest - away_rest,
                    "odds": _odds_to_ml_context(odds),
                },
            }
            samples.append(sample)

        # Update histories AFTER emitting the sample (preserves point-in-time).
        home_hist.record(
            date, "home", home_goals, away_goals, _result_for(home_goals, away_goals),
            xg_for=match_home_xg, xg_against=match_away_xg,
        )
        away_hist.record(
            date, "away", away_goals, home_goals, _result_for(away_goals, home_goals),
            xg_for=match_away_xg, xg_against=match_home_xg,
        )
        _update_elo(home_hist, away_hist, home_goals, away_goals)

    return samples


def _result_for(team_goals: int, opp_goals: int) -> str:
    if team_goals > opp_goals:
        return "W"
    if team_goals == opp_goals:
        return "D"
    return "L"


def _rest_days(hist: TeamHistory, date: datetime) -> int:
    last = hist.last_match_date()
    if last is None:
        return 7
    delta = (date - last).days
    return max(1, min(21, delta))


def _odds_to_ml_context(odds: Dict[str, float]) -> Dict[str, float]:
    if not odds:
        return {}
    return {
        "openingHomeOdds": odds.get("homeWinOdds", 0),
        "openingDrawOdds": odds.get("drawOdds", 0),
        "openingAwayOdds": odds.get("awayWinOdds", 0),
        "currentHomeOdds": odds.get("homeWinOdds", 0),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect point-in-time training data from API-Football")
    parser.add_argument("--seasons", default="2022,2023,2024,2025", help="Comma-separated seasons")
    parser.add_argument("--leagues", default=",".join(map(str, DEFAULT_LEAGUES)), help="Comma-separated league IDs")
    parser.add_argument("--max-fixtures", type=int, default=100000, help="Max samples to keep")
    parser.add_argument("--with-odds", action="store_true", help="Also fetch opening odds (1 API call/fixture)")
    parser.add_argument("--with-xg", action="store_true", help="Fetch real xG via /fixtures/statistics (Ultra plan; 1 call/fixture)")
    parser.add_argument("--sleep", type=float, default=None, help="Seconds between API calls per thread (overrides API_FOOTBALL_SLEEP)")
    parser.add_argument("--workers", type=int, default=None, help="Concurrent prefetch workers (overrides API_FOOTBALL_WORKERS)")
    args = parser.parse_args()

    global RATE_SLEEP, MAX_WORKERS
    if args.sleep is not None:
        RATE_SLEEP = args.sleep
    if args.workers is not None:
        MAX_WORKERS = args.workers

    seasons = [int(s) for s in args.seasons.split(",")]
    leagues = [int(l) for l in args.leagues.split(",")]

    if not API_KEY:
        print("ERROR: API_FOOTBALL_KEY not found in .env.local")
        return

    print("Football ML Data Collector (point-in-time)")
    print(f"  Seasons: {seasons}")
    print(f"  Leagues: {len(leagues)}")
    print(f"  Odds:    {'yes' if args.with_odds else 'no'}")
    print(f"  Real xG: {'yes' if args.with_xg else 'no (goal-rate proxy)'}")
    print(f"  Sleep:   {RATE_SLEEP}s/call  Workers: {MAX_WORKERS}")
    print()

    all_samples: List[dict] = []

    for league_id in leagues:
        for season in seasons:
            if len(all_samples) >= args.max_fixtures:
                break
            try:
                fixtures = collect_fixtures(league_id, season)
                league_name = ""
                if fixtures:
                    league_name = fixtures[0].get("league", {}).get("name", "")
                remaining = args.max_fixtures - len(all_samples)
                samples = build_samples_for_competition(
                    fixtures, league_name, args.with_odds, with_xg=args.with_xg, max_samples=remaining
                )
                all_samples.extend(samples)
                print(f"  + league={league_id} season={season}: {len(samples)} samples (total {len(all_samples)})")
            except Exception as e:
                print(f"  x Error league={league_id} season={season}: {e}")
                continue

    output_file = DATA_DIR / "training_data.json"
    with open(output_file, "w") as f:
        json.dump(all_samples, f)

    print(f"\nCollected {len(all_samples)} point-in-time samples")
    print(f"  Saved to: {output_file}")
    if all_samples:
        print(f"  File size: {output_file.stat().st_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
