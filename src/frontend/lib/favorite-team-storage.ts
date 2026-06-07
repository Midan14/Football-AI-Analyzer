/** localStorage keys shared across Match Center, Live, Calendar, Watchlist */
export const FAVORITE_TEAM_IDS_KEY = "live-sound-favorite-teams";
export const LIVE_SOUND_ENABLED_KEY = "live-sound-enabled";
export const FAVORITE_ALERTS_BAR_EXPANDED_KEY = "live-alerts-bar-expanded";

export function readFavoriteAlertsBarExpanded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(FAVORITE_ALERTS_BAR_EXPANDED_KEY);
    if (raw === null) return false;
    return JSON.parse(raw) as boolean;
  } catch {
    return false;
  }
}

export function writeFavoriteAlertsBarExpanded(expanded: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FAVORITE_ALERTS_BAR_EXPANDED_KEY, JSON.stringify(expanded));
  } catch {
    // ignore
  }
}

export function readFavoriteTeamIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAVORITE_TEAM_IDS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function readLiveSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(LIVE_SOUND_ENABLED_KEY);
    if (raw === null) return true;
    return JSON.parse(raw) as boolean;
  } catch {
    return true;
  }
}
