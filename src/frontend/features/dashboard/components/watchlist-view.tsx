"use client";

import { Star, Trash2, Zap, Radio, Clock3 } from "lucide-react";
import { useMemo } from "react";
import type { Fixture } from "@/shared/domain";
import { useLocalStorage } from "@/frontend/hooks/use-local-storage";

export function WatchlistView({
  fixtures,
  starred,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onToggleStar,
  onOpenFixture,
}: {
  fixtures: Fixture[];
  starred: Set<string>;
  onToggleStar: (fixture: Fixture) => void;
  onOpenFixture: (fixture: Fixture) => void;
}) {
  const [favoriteTeams, setFavoriteTeams] = useLocalStorage<string[]>("live-sound-favorite-teams", []);

  // Fixtures where favorite teams play
  const favoriteFixtures = useMemo(() => {
    return fixtures.filter(f =>
      favoriteTeams.includes(f.home.id) || favoriteTeams.includes(f.away.id)
    );
  }, [fixtures, favoriteTeams]);

  // Starred fixtures (legacy)
  const starredFixtures = useMemo(() => {
    return fixtures.filter(f => starred.has(f.id));
  }, [fixtures, starred]);

  // All watched = favorites + starred (deduplicated)
  const allWatched = useMemo(() => {
    const ids = new Set<string>();
    const result: Fixture[] = [];
    for (const f of [...favoriteFixtures, ...starredFixtures]) {
      if (!ids.has(f.id)) { ids.add(f.id); result.push(f); }
    }
    return result.sort((a, b) => {
      if (a.status === "live" && b.status !== "live") return -1;
      if (b.status === "live" && a.status !== "live") return 1;
      return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
    });
  }, [favoriteFixtures, starredFixtures]);

  // Get unique team names from favorites
  const favoriteTeamNames = useMemo(() => {
    const names: Array<{ id: string; name: string; logo?: string }> = [];
    const seen = new Set<string>();
    for (const f of fixtures) {
      if (favoriteTeams.includes(f.home.id) && !seen.has(f.home.id)) {
        seen.add(f.home.id);
        names.push({ id: f.home.id, name: f.home.name, logo: f.home.logo });
      }
      if (favoriteTeams.includes(f.away.id) && !seen.has(f.away.id)) {
        seen.add(f.away.id);
        names.push({ id: f.away.id, name: f.away.name, logo: f.away.logo });
      }
    }
    return names;
  }, [fixtures, favoriteTeams]);

  const removeFavoriteTeam = (teamId: string) => {
    setFavoriteTeams(prev => prev.filter(id => id !== teamId));
  };

  const liveCount = allWatched.filter(f => f.status === "live").length;

  return (
    <section className="view-workspace wl-view">
      {/* Header */}
      <article className="wl-header">
        <div>
          <h2><Star size={22} /> Watchlist</h2>
          <p>Partidos de tus equipos favoritos · {allWatched.length} partidos hoy · {favoriteTeams.length} equipos seguidos</p>
        </div>
        <div className="wl-header-stats">
          {liveCount > 0 && <span className="wl-stat live"><Radio size={12} /> {liveCount} en vivo</span>}
          <span className="wl-stat">{allWatched.length} partidos</span>
        </div>
      </article>

      {/* Favorite teams */}
      {favoriteTeamNames.length > 0 && (
        <div className="wl-teams">
          <h4>Equipos favoritos ({favoriteTeamNames.length})</h4>
          <div className="wl-teams-list">
            {favoriteTeamNames.map(team => (
              <div key={team.id} className="wl-team-chip">
                {team.logo && <img src={team.logo} alt="" className="wl-team-logo" />}
                <span>{team.name}</span>
                <button className="wl-team-remove" onClick={() => removeFavoriteTeam(team.id)} title="Quitar de favoritos">
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
          <p className="wl-teams-hint">Agrega equipos desde el Match Center o Partidos en Vivo con la ⭐</p>
        </div>
      )}

      {/* Watched fixtures */}
      <div className="wl-fixtures">
        {allWatched.length === 0 ? (
          <div className="wl-empty">
            <Star size={40} />
            <strong>Sin equipos favoritos</strong>
            <p>Marca equipos con la ⭐ en el Match Center o Partidos en Vivo para verlos aquí.</p>
          </div>
        ) : (
          allWatched.map(fixture => {
            const isHomeFav = favoriteTeams.includes(fixture.home.id);
            const isAwayFav = favoriteTeams.includes(fixture.away.id);
            return (
              <button
                key={fixture.id}
                className={`wl-fixture-card ${fixture.status}`}
                onClick={() => onOpenFixture(fixture)}
              >
                {/* Status */}
                <div className="wl-fx-status">
                  {fixture.status === "live" ? (
                    <span className="wl-fx-live"><span className="wl-live-dot" />{(fixture as any).elapsed ?? "?"}′</span>
                  ) : fixture.status === "final" ? (
                    <span className="wl-fx-final">FT</span>
                  ) : (
                    <span className="wl-fx-time">
                      <Clock3 size={11} />
                      {new Date(fixture.kickoff).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" })}
                    </span>
                  )}
                </div>

                {/* Teams */}
                <div className="wl-fx-teams">
                  <div className={`wl-fx-team ${isHomeFav ? "fav" : ""}`}>
                    {fixture.home.logo && <img src={fixture.home.logo} alt="" className="wl-fx-logo" />}
                    <strong>{fixture.home.name}</strong>
                    {isHomeFav && <Star size={10} className="wl-fav-star" />}
                  </div>
                  <div className={`wl-fx-team ${isAwayFav ? "fav" : ""}`}>
                    {fixture.away.logo && <img src={fixture.away.logo} alt="" className="wl-fx-logo" />}
                    <strong>{fixture.away.name}</strong>
                    {isAwayFav && <Star size={10} className="wl-fav-star" />}
                  </div>
                </div>

                {/* Score */}
                <div className="wl-fx-score">
                  {fixture.result ? (
                    <span className={fixture.status === "live" ? "live" : ""}>{fixture.result.homeGoals} - {fixture.result.awayGoals}</span>
                  ) : (
                    <span className="vs">vs</span>
                  )}
                </div>

                {/* Odds */}
                <div className="wl-fx-odds">
                  {fixture.market.homeWinOdds > 0 ? (
                    <>
                      <span>{fixture.market.homeWinOdds.toFixed(2)}</span>
                      <span className="draw">{fixture.market.drawOdds.toFixed(2)}</span>
                      <span>{fixture.market.awayWinOdds.toFixed(2)}</span>
                    </>
                  ) : "—"}
                </div>

                {/* League */}
                <div className="wl-fx-league">
                  <small>{fixture.leagueName}</small>
                </div>

                {/* Action */}
                <div className="wl-fx-action"><Zap size={14} /></div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
