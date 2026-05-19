"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Radio, Search, Star, Trophy, Volume2, VolumeX, Zap } from "lucide-react";
import type { Fixture } from "@/shared/domain";
import { useLiveFixtures, useLiveDetail } from "@/frontend/hooks/use-live";
import { playEventSound } from "@/frontend/lib/sounds";
import { useLocalStorage } from "@/frontend/hooks/use-local-storage";

export function LiveMatchesView({ fixture: _fixture, onOpenMatchCenter }: { fixture?: Fixture; onOpenMatchCenter?: (fixture: Fixture) => void }) {
  const { data: liveFixtures = [], isLoading } = useLiveFixtures();
  const [selectedLiveId, setSelectedLiveId] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [favoriteTeams, setFavoriteTeams] = useLocalStorage<string[]>("live-sound-favorite-teams", []);
  const { data: liveDetail, isLoading: detailLoading } = useLiveDetail(selectedLiveId);
  const prevEventsRef = useRef<Map<string, number>>(new Map());

  const toggleFavoriteTeam = (teamId: string) => {
    setFavoriteTeams((prev) =>
      prev.includes(teamId) ? prev.filter((x) => x !== teamId) : [...prev, teamId]
    );
  };

  const isMatchFavorite = (f: Fixture) => {
    return favoriteTeams.includes(f.home.id) || favoriteTeams.includes(f.away.id);
  };

  // Play sound only for matches where a FAVORITE TEAM plays
  useEffect(() => {
    if (!soundEnabled || favoriteTeams.length === 0) return;

    for (const f of liveFixtures) {
      if (!isMatchFavorite(f)) continue;
      const currentGoals = (f.result?.homeGoals ?? 0) + (f.result?.awayGoals ?? 0);
      const prevGoals = prevEventsRef.current.get(f.id) ?? 0;
      if (currentGoals > prevGoals && prevGoals > 0) {
        playEventSound("Goal", "");
      }
      prevEventsRef.current.set(f.id, currentGoals);
    }
  }, [liveFixtures, soundEnabled, favoriteTeams]);

  // Play sound for selected match detail events (only if favorite team)
  const prevDetailEventsRef = useRef<number>(0);
  useEffect(() => {
    if (!liveDetail || !soundEnabled || !selectedLiveId) return;
    if (!isMatchFavorite(liveDetail.fixture)) return;

    const currentCount = liveDetail.events.length;
    if (currentCount > prevDetailEventsRef.current && prevDetailEventsRef.current > 0) {
      const newEvents = liveDetail.events.slice(prevDetailEventsRef.current);
      for (const event of newEvents) {
        playEventSound(event.type, event.detail);
      }
    }
    prevDetailEventsRef.current = currentCount;
  }, [liveDetail, soundEnabled, selectedLiveId, favoriteTeams]);

  // Group by league
  const grouped = useMemo(() => {
    const filtered = liveFixtures.filter((f) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return f.home.name.toLowerCase().includes(q) || f.away.name.toLowerCase().includes(q) || f.leagueName.toLowerCase().includes(q);
    });
    const map = new Map<string, { leagueName: string; fixtures: Fixture[] }>();
    for (const f of filtered) {
      const group = map.get(f.leagueId) ?? { leagueName: f.leagueName, fixtures: [] };
      group.fixtures.push(f);
      map.set(f.leagueId, group);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].leagueName.localeCompare(b[1].leagueName));
  }, [liveFixtures, searchQuery]);

  return (
    <section className="view-workspace">
      <article className="workspace-hero">
        <div>
          <span>En Vivo</span>
          <h2>Partidos en Tiempo Real</h2>
          <p>Datos actualizados cada 30 segundos desde API-Football. Haz clic en un partido para ver estadísticas en vivo.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 8,
              border: `1px solid ${soundEnabled ? "rgba(52,211,153,.4)" : "rgba(255,255,255,.1)"}`,
              background: soundEnabled ? "rgba(52,211,153,.1)" : "transparent",
              color: soundEnabled ? "#34d399" : "#8fa89a",
              fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            {soundEnabled ? "Sonido ON" : "Sonido OFF"}
          </button>
          <div className="hero-metrics">
            <strong>{liveFixtures.length}</strong><span>en vivo</span>
          </div>
        </div>
      </article>

      <div className="live-layout">
        {/* Left: List of live matches */}
        <div className="live-list-panel">
          <div className="live-list-header">
            <div className="live-indicator">
              <span className="live-dot-big" />
              <strong>{liveFixtures.length} partidos en vivo</strong>
            </div>
            <div className="live-search">
              <Search size={14} />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar..." />
            </div>
          </div>

          <div className="live-list-body">
            {isLoading && <div className="live-loading">Cargando partidos en vivo...</div>}

            {!isLoading && grouped.length === 0 && (
              <div className="live-empty">No hay partidos en vivo en este momento.</div>
            )}

            {grouped.map(([leagueId, group]) => (
              <div key={leagueId} className="live-league-group">
                <div className="live-league-header">
                  <Trophy size={12} />
                  <span>{group.leagueName}</span>
                  <small>{group.fixtures.length}</small>
                </div>
                {group.fixtures.map((m) => (
                  <button
                    key={m.id}
                    className={`live-match-row ${selectedLiveId === m.id ? "active" : ""} ${isMatchFavorite(m) ? "favorite" : ""}`}
                    onClick={() => setSelectedLiveId(m.id)}
                  >
                    <div className="live-match-badge">
                      <span className="live-pulse-dot" />
                      <span className="live-match-min">{(m as any).elapsed ?? "?"}′</span>
                    </div>
                    <div className="live-match-info">
                      <div className="live-match-team">
                        {m.home.logo && <img src={m.home.logo} alt="" className="live-team-img" />}
                        <span>{m.home.name}</span>
                        <b>{m.result?.homeGoals ?? 0}</b>
                        <button
                          className={`live-fav-btn ${favoriteTeams.includes(m.home.id) ? "active" : ""}`}
                          onClick={(e) => { e.stopPropagation(); toggleFavoriteTeam(m.home.id); }}
                          title={favoriteTeams.includes(m.home.id) ? "Quitar alerta" : "Alerta para este equipo"}
                        >
                          <Star size={12} />
                        </button>
                      </div>
                      <div className="live-match-team">
                        {m.away.logo && <img src={m.away.logo} alt="" className="live-team-img" />}
                        <span>{m.away.name}</span>
                        <b>{m.result?.awayGoals ?? 0}</b>
                        <button
                          className={`live-fav-btn ${favoriteTeams.includes(m.away.id) ? "active" : ""}`}
                          onClick={(e) => { e.stopPropagation(); toggleFavoriteTeam(m.away.id); }}
                          title={favoriteTeams.includes(m.away.id) ? "Quitar alerta" : "Alerta para este equipo"}
                        >
                          <Star size={12} />
                        </button>
                      </div>
                    </div>
                    {m.result?.firstHalfHome !== undefined && (
                      <span className="live-match-ht">HT {m.result.firstHalfHome}-{m.result.firstHalfAway}</span>
                    )}
                    {m.market.homeWinOdds > 0 && (
                      <div className="live-match-odds">
                        <span>{m.market.homeWinOdds.toFixed(2)}</span>
                        <span>{m.market.drawOdds.toFixed(2)}</span>
                        <span>{m.market.awayWinOdds.toFixed(2)}</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Live detail */}
        <div className="live-detail-panel">
          {!selectedLiveId ? (
            <div className="live-detail-empty">
              <Radio size={40} />
              <p>Selecciona un partido en vivo para ver estadísticas en tiempo real</p>
            </div>
          ) : detailLoading ? (
            <div className="live-detail-empty">
              <Activity size={32} className="spin" />
              <p>Cargando datos en vivo...</p>
            </div>
          ) : liveDetail ? (
            <>
              {/* Match header */}
              <div className="live-detail-header">
                <div className="live-detail-team">
                  {liveDetail.fixture.home.logo && <img src={liveDetail.fixture.home.logo} alt="" className="live-detail-logo" />}
                  <strong>{liveDetail.fixture.home.name}</strong>
                </div>
                <div className="live-detail-score">
                  <div className="live-score-big">
                    <span>{liveDetail.fixture.result?.homeGoals ?? 0}</span>
                    <span className="live-score-sep">-</span>
                    <span>{liveDetail.fixture.result?.awayGoals ?? 0}</span>
                  </div>
                  <div className="live-elapsed">
                    <span className="live-pulse-dot" />
                    <strong>{(liveDetail.fixture as any).elapsed ?? "?"}&apos;</strong>
                  </div>
                  <small>{liveDetail.fixture.leagueName}</small>
                </div>
                <div className="live-detail-team away">
                  {liveDetail.fixture.away.logo && <img src={liveDetail.fixture.away.logo} alt="" className="live-detail-logo" />}
                  <strong>{liveDetail.fixture.away.name}</strong>
                </div>
              </div>

              {/* Statistics */}
              {liveDetail.statistics.length > 0 && (
                <div className="live-stats-section">
                  <h3><Activity size={16} /> Estadísticas en Vivo</h3>
                  <div className="live-stats-grid">
                    {liveDetail.statistics.map((s) => (
                      <div key={s.type} className="live-stat-row">
                        <span className="live-stat-home">{s.home}</span>
                        <span className="live-stat-label">{s.type}</span>
                        <span className="live-stat-away">{s.away}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Events */}
              {liveDetail.events.length > 0 && (
                <div className="live-events-section">
                  <h3><Zap size={16} /> Eventos del Partido</h3>
                  <div className="live-events-list">
                    {liveDetail.events.map((e, i) => (
                      <div key={i} className={`live-event-row ${e.type.toLowerCase()}`}>
                        <span className="live-event-time">{e.time}&apos;</span>
                        <span className="live-event-icon">
                          {e.type === "Goal" ? "⚽" : e.type === "Card" ? "🟨" : e.type === "subst" ? "🔄" : "📋"}
                        </span>
                        <div className="live-event-info">
                          <strong>{e.player || e.detail}</strong>
                          <small>{e.team} · {e.detail}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {liveDetail.statistics.length === 0 && liveDetail.events.length === 0 && (
                <div className="live-detail-empty small">
                  <p>Estadísticas no disponibles para esta liga. Los eventos se actualizan cada 20 segundos.</p>
                </div>
              )}

              {/* Action: Open Match Center */}
              {onOpenMatchCenter && (
                <div className="live-detail-actions">
                  <button className="live-analyze-btn" onClick={() => onOpenMatchCenter(liveDetail.fixture)}>
                    <Zap size={16} /> Analizar en Match Center
                  </button>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
