"use client";

import { AlertTriangle, Cloud, Plane, ShieldCheck, TrendingUp, UsersRound } from "lucide-react";
import type { AnalysisResult, Fixture, H2HRecord, SquadDynamic } from "@/shared/domain";

export type MatchCenterTab = "resumen" | "h2h" | "partido" | "contexto";

export function MatchCenterTabBar({
  activeTab,
  onChange,
  fixture,
  lineupsCount,
  eventsCount,
}: {
  activeTab: MatchCenterTab;
  onChange: (tab: MatchCenterTab) => void;
  fixture: Fixture;
  lineupsCount: number;
  eventsCount: number;
}) {
  const tabs: { id: MatchCenterTab; label: string; count?: number }[] = [
    { id: "resumen", label: "Análisis" },
    { id: "h2h", label: "H2H", count: fixture.h2h?.length },
    { id: "partido", label: "En vivo", count: lineupsCount + eventsCount || undefined },
    { id: "contexto", label: "Contexto" },
  ];

  return (
    <nav className="mc-tabs" aria-label="Secciones del Match Center">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`mc-tab ${activeTab === tab.id ? "active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count != null && tab.count > 0 && <span className="mc-tab-badge">{tab.count}</span>}
        </button>
      ))}
    </nav>
  );
}

function formatH2HDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Bogota",
  });
}

function summarizeH2H(fixture: Fixture, records: H2HRecord[]) {
  if (records.length === 0) return null;

  const homePrefix = fixture.home.name.split(" ")[0].toLowerCase();
  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  let btts = 0;
  let over25 = 0;
  let totalGoals = 0;

  for (const r of records) {
    const histHomeIsCurrentHome = r.home.toLowerCase().includes(homePrefix);
    const hg = histHomeIsCurrentHome ? r.homeGoals : r.awayGoals;
    const ag = histHomeIsCurrentHome ? r.awayGoals : r.homeGoals;
    totalGoals += hg + ag;
    if (hg > 0 && ag > 0) btts += 1;
    if (hg + ag >= 3) over25 += 1;
    if (hg > ag) homeWins += 1;
    else if (hg < ag) awayWins += 1;
    else draws += 1;
  }

  const n = records.length;
  return {
    sample: n,
    homeWins,
    awayWins,
    draws,
    bttsRate: Math.round((btts / n) * 100),
    over25Rate: Math.round((over25 / n) * 100),
    avgGoals: (totalGoals / n).toFixed(1),
  };
}

export function MatchCenterH2HPanel({ fixture }: { fixture: Fixture }) {
  const records = fixture.h2h ?? [];
  const summary = summarizeH2H(fixture, records);

  if (records.length === 0) {
    return (
      <div className="mc-panel mc-empty">
        <TrendingUp size={20} />
        <p>No hay historial H2H disponible para este enfrentamiento en API-Football.</p>
      </div>
    );
  }

  return (
    <div className="mc-panel mc-h2h">
      {summary && (
        <div className="mc-h2h-summary">
          <div className="mc-h2h-stat">
            <span>Victorias {fixture.home.name.split(" ")[0]}</span>
            <strong>{summary.homeWins}</strong>
          </div>
          <div className="mc-h2h-stat">
            <span>Empates</span>
            <strong>{summary.draws}</strong>
          </div>
          <div className="mc-h2h-stat">
            <span>Victorias {fixture.away.name.split(" ")[0]}</span>
            <strong>{summary.awayWins}</strong>
          </div>
          <div className="mc-h2h-stat">
            <span>BTTS</span>
            <strong>{summary.bttsRate}%</strong>
          </div>
          <div className="mc-h2h-stat">
            <span>Over 2.5</span>
            <strong>{summary.over25Rate}%</strong>
          </div>
          <div className="mc-h2h-stat">
            <span>Goles/partido</span>
            <strong>{summary.avgGoals}</strong>
          </div>
        </div>
      )}

      <ul className="mc-h2h-list">
        {records.map((r, i) => (
          <li key={`${r.date}-${i}`} className="mc-h2h-row">
            <time dateTime={r.date}>{formatH2HDate(r.date)}</time>
            <span className="mc-h2h-teams">
              {r.home} vs {r.away}
            </span>
            <strong className="mc-h2h-score">
              {r.homeGoals} - {r.awayGoals}
            </strong>
            <small>{r.competition}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InjuryList({
  teamName,
  injuries,
}: {
  teamName: string;
  injuries: SquadDynamic["injuries"];
}) {
  if (!injuries || injuries.length === 0) {
    return (
      <div className="mc-injury-team">
        <strong>{teamName}</strong>
        <span className="mc-muted">Sin bajas reportadas</span>
      </div>
    );
  }

  return (
    <div className="mc-injury-team">
      <strong>{teamName}</strong>
      <ul className="mc-injury-list">
        {injuries.map((inj, i) => (
          <li key={`${inj.player}-${i}`} className="mc-injury-row">
            <span>{inj.player}</span>
            <small>{inj.status}</small>
            <span className={`mc-impact mc-impact-${inj.impact >= 7 ? "high" : inj.impact >= 5 ? "med" : "low"}`}>
              Impacto {inj.impact}/10
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MatchCenterContextPanel({ fixture, analysis }: { fixture: Fixture; analysis: AnalysisResult }) {
  const homeInj = fixture.squad?.home.injuries ?? [];
  const awayInj = fixture.squad?.away.injuries ?? [];

  return (
    <div className="mc-panel mc-context">
      <div className="mc-context-grid">
        <div className="mc-context-card">
          <ShieldCheck size={18} />
          <div>
            <span>Árbitro</span>
            <strong>{fixture.referee?.name ?? "Sin asignar"}</strong>
            {fixture.referee && (
              <small>
                Rigor {fixture.referee.strictness} · ~{fixture.referee.avgCards} tarjetas · Sesgo local {fixture.referee.homeBias}%
              </small>
            )}
          </div>
        </div>
        <div className="mc-context-card">
          <Plane size={18} />
          <div>
            <span>Viaje visitante</span>
            <strong>{fixture.away.travelKm} km</strong>
            <small>Descanso local {fixture.home.restDays}d · visita {fixture.away.restDays}d</small>
          </div>
        </div>
        <div className="mc-context-card">
          <UsersRound size={18} />
          <div>
            <span>Motivación</span>
            <strong>
              {fixture.home.motivation} / {fixture.away.motivation}
            </strong>
            <small>Local vs visitante (0-100)</small>
          </div>
        </div>
        <div className="mc-context-card">
          <Cloud size={18} />
          <div>
            <span>Clima / contexto</span>
            <strong>{fixture.context.weatherRisk === "high" ? "Riesgo alto" : fixture.context.weatherRisk === "medium" ? "Moderado" : "Normal"}</strong>
            <small>
              {fixture.context.derby ? "Derbi · " : ""}
              {fixture.context.mustWinHome ? "Local debe ganar · " : ""}
              {fixture.context.mustWinAway ? "Visita debe ganar" : ""}
              {!fixture.context.derby && !fixture.context.mustWinHome && !fixture.context.mustWinAway ? "Partido estándar" : ""}
            </small>
          </div>
        </div>
      </div>

      {(homeInj.length > 0 || awayInj.length > 0) && (
        <div className="mc-injuries-block">
          <h4><AlertTriangle size={14} /> Bajas confirmadas</h4>
          <div className="mc-injuries-grid">
            <InjuryList teamName={fixture.home.name} injuries={homeInj} />
            <InjuryList teamName={fixture.away.name} injuries={awayInj} />
          </div>
        </div>
      )}

      <div className="mc-coverage-strip" title="Verde = dato recibido de API-Football en este análisis">
        <span className={fixture.coverage.hasOdds ? "on" : "off"}>Odds</span>
        <span className={fixture.coverage.hasLineups ? "on" : "off"}>Alineaciones</span>
        <span className={fixture.coverage.hasH2H ? "on" : "off"}>H2H</span>
        <span className={fixture.coverage.hasInjuries ? "on" : "off"}>Lesiones</span>
        <span className={fixture.coverage.hasReferee ? "on" : "off"}>Árbitro</span>
        <span className={fixture.coverage.hasXg ? "on" : "off"}>xG/Stats</span>
      </div>
      <p className="mc-coverage-hint">
        Los chips indican qué datos llegaron al analizar. Si ves gris, la API no devolvió ese bloque (cuota agotada,
        liga sin cobertura o dato aún no publicado). Re-ejecutá modelos tras confirmar alineaciones.
      </p>

      {analysis.riskFlags.length > 0 && (
        <div className="mc-context-risks">
          <h4>Riesgos del modelo</h4>
          <div className="qa-risk-list">
            {analysis.riskFlags.map((flag) => (
              <span key={flag.id} className={`qa-risk-tag ${flag.severity}`}>
                {flag.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
