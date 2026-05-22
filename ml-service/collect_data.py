"""
Data Collection Script — Downloads historical fixtures from API-Football.
Collects fixtures + team stats for training ML models.

Usage:
    python collect_data.py --seasons 2023,2024,2025 --leagues 39,140,135,78,61

This will download all fixtures and team statistics for the specified
seasons and leagues, saving them as training data.
"""

import os
import json
import time
import httpx
import argparse
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env.local")

API_KEY = os.getenv("API_FOOTBALL_KEY", "")
BASE_URL = "https://v3.football.api-sports.io"
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# Top leagues to collect
DEFAULT_LEAGUES = [
    39,   # Premier League
    140,  # La Liga
    135,  # Serie A
    78,   # Bundesliga
    61,   # Ligue 1
    2,    # Champions League
    3,    # Europa League
    88,   # Eredivisie
    94,   # Primeira Liga
    203,  # Super Lig
    71,   # Serie A Brazil
    128,  # Liga MX (Apertura)
    253,  # MLS
    239,  # Liga BetPlay
    262,  # Liga 1 Peru
]

HEADERS = {"x-apisports-key": API_KEY}


def api_request(endpoint: str, params: dict) -> dict:
    """Make a rate-limited request to API-Football."""
    url = f"{BASE_URL}{endpoint}"
    response = httpx.get(url, headers=HEADERS, params=params, timeout=30)
    response.raise_for_status()
    data = response.json()
    # Rate limit: 10 requests/minute on free, 300/minute on Pro
    time.sleep(0.3)
    return data


def collect_fixtures(league_id: int, season: int) -> list:
    """Collect all fixtures for a league/season."""
    print(f"  Collecting fixtures: league={league_id}, season={season}")
    data = api_request("/fixtures", {"league": league_id, "season": season})
    fixtures = data.get("response", [])
    print(f"    → {len(fixtures)} fixtures found")
    return fixtures


def collect_team_stats(team_id: int, league_id: int, season: int) -> dict:
    """Collect team statistics for a season."""
    data = api_request("/teams/statistics", {"team": team_id, "league": league_id, "season": season})
    return data.get("response", {})


def collect_odds(fixture_id: int) -> list:
    """Collect odds for a fixture."""
    data = api_request("/odds", {"fixture": fixture_id})
    return data.get("response", [])


def build_training_sample(fixture: dict, home_stats: dict, away_stats: dict) -> dict | None:
    """Build a training sample from a finished fixture."""
    status = fixture.get("fixture", {}).get("status", {}).get("short", "")
    if status != "FT":
        return None  # Only use finished matches

    home_goals = fixture.get("goals", {}).get("home")
    away_goals = fixture.get("goals", {}).get("away")
    if home_goals is None or away_goals is None:
        return None

    # Determine result
    if home_goals > away_goals:
        result = "HOME_WIN"
    elif home_goals == away_goals:
        result = "DRAW"
    else:
        result = "AWAY_WIN"

    return {
        "fixture_id": fixture["fixture"]["id"],
        "league_id": fixture["league"]["id"],
        "league_name": fixture["league"]["name"],
        "season": fixture["league"].get("season"),
        "date": fixture["fixture"]["date"],
        "home_team": fixture["teams"]["home"]["name"],
        "away_team": fixture["teams"]["away"]["name"],
        "home_team_id": fixture["teams"]["home"]["id"],
        "away_team_id": fixture["teams"]["away"]["id"],
        "home_goals": home_goals,
        "away_goals": away_goals,
        "total_goals": home_goals + away_goals,
        "result": result,
        "btts": home_goals > 0 and away_goals > 0,
        "over_25": (home_goals + away_goals) >= 3,
        "over_15": (home_goals + away_goals) >= 2,
        "home_stats": home_stats,
        "away_stats": away_stats,
    }


def main():
    parser = argparse.ArgumentParser(description="Collect training data from API-Football")
    parser.add_argument("--seasons", default="2023,2024,2025", help="Comma-separated seasons")
    parser.add_argument("--leagues", default=",".join(map(str, DEFAULT_LEAGUES)), help="Comma-separated league IDs")
    parser.add_argument("--max-fixtures", type=int, default=50000, help="Max fixtures to collect")
    args = parser.parse_args()

    seasons = [int(s) for s in args.seasons.split(",")]
    leagues = [int(l) for l in args.leagues.split(",")]

    if not API_KEY:
        print("ERROR: API_FOOTBALL_KEY not found in .env.local")
        return

    print(f"🏈 Football ML Data Collector")
    print(f"   Seasons: {seasons}")
    print(f"   Leagues: {len(leagues)}")
    print(f"   API Key: {API_KEY[:8]}...")
    print()

    all_samples = []
    teams_cache = {}  # Cache team stats to avoid duplicate requests

    for season in seasons:
        for league_id in leagues:
            try:
                fixtures = collect_fixtures(league_id, season)

                for fx in fixtures:
                    if len(all_samples) >= args.max_fixtures:
                        break

                    home_id = fx["teams"]["home"]["id"]
                    away_id = fx["teams"]["away"]["id"]

                    # Get team stats (cached)
                    home_key = f"{home_id}_{league_id}_{season}"
                    away_key = f"{away_id}_{league_id}_{season}"

                    if home_key not in teams_cache:
                        try:
                            teams_cache[home_key] = collect_team_stats(home_id, league_id, season)
                        except Exception:
                            teams_cache[home_key] = {}

                    if away_key not in teams_cache:
                        try:
                            teams_cache[away_key] = collect_team_stats(away_id, league_id, season)
                        except Exception:
                            teams_cache[away_key] = {}

                    sample = build_training_sample(fx, teams_cache[home_key], teams_cache[away_key])
                    if sample:
                        all_samples.append(sample)

                print(f"  ✓ Total samples so far: {len(all_samples)}")

            except Exception as e:
                print(f"  ✗ Error league={league_id} season={season}: {e}")
                continue

    # Save
    output_file = DATA_DIR / "training_data.json"
    with open(output_file, "w") as f:
        json.dump(all_samples, f)

    print(f"\n✅ Collected {len(all_samples)} training samples")
    print(f"   Saved to: {output_file}")
    print(f"   File size: {output_file.stat().st_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
