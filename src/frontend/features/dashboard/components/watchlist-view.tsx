"use client";

import { Star, Trash2, Zap, Radio, Clock3 } from "lucide-react";
import { useMemo } from "react";
import type { Fixture } from "@/shared/domain";
import { useLocalStorage } from "@/frontend/hooks/use-local-storage";

function sortFixtures(list: Fixture[]) {
  return [...list].sort((a, b) => {
    if (a.status === "live" && b.status !== "live") return -1;
    if (b.status === "live" && a.status !== "live") return 1;
    return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
  });
}

function FixtureRow({
  fixture,
  favoriteTeams,
  starred,
  onToggleStar,
  onOpenFixture,
}: {
  fixture: Fixture;
  favoriteTeams: string[];
  starred: Set<string>;
  onToggleStar: (fixture: Fixture) => void;
  onOpenFixture: (fixture: Fixture) => void;
}) {
  const isStarred = starred.has(fixture.id);
  const isHomeFav = favoriteTeams.includes(fixture.home.id);
  const isAwayFav = favoriteTeams.includes(fixture.away.id);

  return (
    <button
      key={fixture.id}
      type="button"
      className={`wl-fixture-card ${fixture.status}`}
      onClick={() => onOpenFixture(fixture)}
    >
      <div className="wl-fx-status">
        {fixture.status === "live" ? (
          <span className="wl-fx-live">
            <span className="wl-live-dot" />
            {(fixture as Fixture & { elapsed?: number }).elapsed ?? "?"}′
          </span>
        ) : fixture.status === "final" ? (
          <span className="wl-fx-final">FT</span>
        ) : (
          <span className="wl-fx-time">
            <Clock3 size={11} />
            {new Date(fixture.kickoff).toLocaleTimeString("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
              timeZone: "America/Bogota",
            })}
          </span>
        )}
      </div>

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

      <div className="wl-fx-score">
        {fixture.result ? (
          <span className={fixture.status === "live" ? "live" : ""}>
            {fixture.result.homeGoals} - {fixture.result.awayGoals}
          </span>
        ) : (
          <span className="vs">vs</span>
        )}
      </div>

      <div className="wl-fx-odds">
        {fixture.market.homeWinOdds > 0 ? (
          <>
            <span>{fixture.market.homeWinOdds.toFixed(2)}</span>
            <span className="draw">{fixture.market.drawOdds.toFixed(2)}</span>
            <span>{fixture.market.awayWinOdds.toFixed(2)}</span>
          </>
        ) : (
          "—"
        )}
      </div>

      <div className="wl-fx-league">
        <small>{fixture.leagueName}</small>
      </div>

      <button
        type="button"
        className={`wl-fx-star-btn ${isStarred ? "active" : ""}`}
        title={isStarred ? "Quitar de watchlist" : "Marcar partido"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleStar(fixture);
        }}
      >
        <Star size={14} fill={isStarred ? "currentColor" : "none"} />
      </button>

      <div className="wl-fx-action">
        <Zap size={14} />
      </div>
    </button>
  );
}

export function WatchlistView({
  fixtures,
  starred,
  onToggleStar,
  onOpenFixture,
}: {
  fixtures: Fixture[];
  starred: Set<string>;
  onToggleStar: (fixture: Fixture) => void;
  onOpenFixture: (fixture: Fixture) => void;
}) {
  const [favoriteTeams, setFavoriteTeams] = useLocalStorage<string[]>(
    "live-sound-favorite-teams",
    []
  );

  const starredOnDate = useMemo(
    () => sortFixtures(fixtures.filter((f) => starred.has(f.id))),
    [fixtures, starred]
  );

  const starredOffDateCount = useMemo(() => {
    const onDateIds = new Set(fixtures.map((f) => f.id));
    return Array.from(starred).filter((id) => !onDateIds.has(id)).length;
  }, [fixtures, starred]);

  const favoriteFixtures = useMemo(() => {
    const starredIds = new Set(starredOnDate.map((f) => f.id));
    return sortFixtures(
      fixtures.filter(
        (f) =>
          !starredIds.has(f.id) &&
          (favoriteTeams.includes(f.home.id) || favoriteTeams.includes(f.away.id))
      )
    );
  }, [fixtures, favoriteTeams, starredOnDate]);

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
    const missing = favoriteTeams.filter((id) => !seen.has(id));
    for (const id of missing) {
      names.push({ id, name: `Equipo #${id}`, logo: undefined });
    }
    return names;
  }, [fixtures, favoriteTeams]);

  const removeFavoriteTeam = (teamId: string) => {
    setFavoriteTeams((prev) => prev.filter((id) => id !== teamId));
  };

  const liveStarred = starredOnDate.filter((f) => f.status === "live").length;

  return (
    <section className="view-workspace wl-view">
      <article className="wl-header">
        <div>
          <h2>
            <Star size={22} /> Watchlist
          </h2>
          <p>
            Partidos marcados con ⭐ y equipos favoritos en la fecha seleccionada ·{" "}
            {starredOnDate.length} partidos ⭐ · {favoriteTeams.length} equipos
          </p>
        </div>
        <div className="wl-header-stats">
          {liveStarred > 0 && (
            <span className="wl-stat live">
              <Radio size={12} /> {liveStarred} en vivo
            </span>
          )}
          <span className="wl-stat">{starred.size} en watchlist</span>
        </div>
      </article>

      {favoriteTeamNames.length > 0 && (
        <div className="wl-teams">
          <h4>Equipos favoritos ({favoriteTeamNames.length})</h4>
          <div className="wl-teams-list">
            {favoriteTeamNames.map((team) => (
              <div key={team.id} className="wl-team-chip">
                {team.logo && <img src={team.logo} alt="" className="wl-team-logo" />}
                <span>{team.name}</span>
                <button
                  type="button"
                  className="wl-team-remove"
                  onClick={() => removeFavoriteTeam(team.id)}
                  title="Quitar de favoritos"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
          <p className="wl-teams-hint">
            Los equipos favoritos muestran partidos de hoy que no están ya en «Partidos ⭐».
          </p>
        </div>
      )}

      <div className="wl-section">
        <h4>Partidos ⭐ ({starredOnDate.length})</h4>
        {starredOffDateCount > 0 && (
          <p className="wl-offdate-hint">
            {starredOffDateCount} partido{starredOffDateCount === 1 ? "" : "s"} de tu watchlist no
            están en esta fecha — cambiá el día en el calendario para verlos.
          </p>
        )}
        {starredOnDate.length === 0 ? (
          <div className="wl-empty compact">
            <Star size={32} />
            <strong>Sin partidos ⭐ en esta fecha</strong>
            <p>Marcá partidos con la estrella en el tablero o en Partidos en Vivo.</p>
          </div>
        ) : (
          <div className="wl-fixtures">
            {starredOnDate.map((fixture) => (
              <FixtureRow
                key={fixture.id}
                fixture={fixture}
                favoriteTeams={favoriteTeams}
                starred={starred}
                onToggleStar={onToggleStar}
                onOpenFixture={onOpenFixture}
              />
            ))}
          </div>
        )}
      </div>

      {favoriteFixtures.length > 0 && (
        <div className="wl-section">
          <h4>Por equipos favoritos ({favoriteFixtures.length})</h4>
          <div className="wl-fixtures">
            {favoriteFixtures.map((fixture) => (
              <FixtureRow
                key={fixture.id}
                fixture={fixture}
                favoriteTeams={favoriteTeams}
                starred={starred}
                onToggleStar={onToggleStar}
                onOpenFixture={onOpenFixture}
              />
            ))}
          </div>
        </div>
      )}

      {starred.size === 0 && favoriteTeams.length === 0 && (
        <div className="wl-empty">
          <Star size={40} />
          <strong>Watchlist vacía</strong>
          <p>
            Usá ⭐ en un partido para seguirlo aquí, o marcá equipos favoritos desde Partidos en Vivo.
          </p>
        </div>
      )}
    </section>
  );
}
