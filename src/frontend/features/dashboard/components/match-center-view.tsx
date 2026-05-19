import { AlertTriangle, Cloud, Plane, ShieldCheck, TrendingUp, UsersRound } from "lucide-react";
import type { AnalysisResult, Fixture } from "@/shared/domain";
import { ProbabilityBarChart, EdgeComparisonChart } from "./charts";
import { formatTime, formPoints } from "../dashboard-utils";

type MatchCenterViewProps = {
  fixture?: Fixture;
  analysis: AnalysisResult | null;
  activeTab: string;
  leagueName: string;
  onTabChange: (tab: string) => void;
};

const tabs = ["Resumen", "Probabilidades", "Mercados", "H2H", "Alineaciones", "Contexto"];

export function MatchCenterView({ fixture, analysis, activeTab, leagueName, onTabChange }: MatchCenterViewProps) {
  return (
    <article className="panel match-center">
      <div className="panel-head">
        <h2>Match Center</h2>
        <span>{leagueName} - Jornada activa</span>
      </div>
      {fixture && analysis ? (
        <>
          <div className="match-hero">
            <div className="team home">
              {fixture.home.logo ? (
                <img src={fixture.home.logo} alt={fixture.home.name} className="club-logo" />
              ) : (
                <div className="club-shield red-shield" />
              )}
              <strong>{fixture.home.name}</strong>
            </div>
            <div className="venue">
              <strong>{formatDateTime(fixture.kickoff)}</strong>
              <span>{fixture.leagueName}</span>
              <span>{fixture.status}</span>
              <small><Cloud size={16} /> {fixture.context.weatherRisk === "high" ? "Clima adverso" : "Condiciones normales"}</small>
            </div>
            <div className="team away">
              {fixture.away.logo ? (
                <img src={fixture.away.logo} alt={fixture.away.name} className="club-logo" />
              ) : (
                <div className="club-shield orange-shield" />
              )}
              <strong>{fixture.away.name}</strong>
            </div>
          </div>
          <StatsTable fixture={fixture} />
          <div className="tabs">
            {tabs.map((tab) => (
              <button className={activeTab === tab ? "active" : ""} onClick={() => onTabChange(tab)} key={tab}>{tab}</button>
            ))}
          </div>
          <MatchTabDetail activeTab={activeTab} fixture={fixture} analysis={analysis} />
        </>
      ) : (
        <div className="empty-state large">Selecciona una liga con partidos disponibles.</div>
      )}
    </article>
  );
}

function MatchTabDetail({ activeTab, fixture, analysis }: { activeTab: string; fixture: Fixture; analysis: AnalysisResult }) {
  if (activeTab === "Probabilidades") {
    return (
      <div className="match-tab-detail probability-tab">
        <ProbabilityBarChart probabilities={analysis.probabilities} />
      </div>
    );
  }

  if (activeTab === "Mercados") {
    return (
      <div className="match-tab-detail market-tab">
        <EdgeComparisonChart valueTable={analysis.valueTable} />
        <div className="market-chips">
          {analysis.valueTable.slice(0, 4).map((row) => (
            <div className="market-chip" key={row.market}>
              <span>{row.market}</span>
              <strong>{row.verdict}</strong>
              <b>{row.edge > 0 ? "+" : ""}{row.edge}%</b>
            </div>
          ))}
        </div>
        <p>Mercado recomendado: <b>{analysis.recommendation.market}</b>. Cuota mínima aceptable {analysis.recommendation.minimumOdds}, stake {analysis.recommendation.stakeUnits}u.</p>
      </div>
    );
  }

  if (activeTab === "H2H") {
    const homeFormPts = formPoints(fixture.home.form);
    const awayFormPts = formPoints(fixture.away.form);
    const gap = homeFormPts - awayFormPts;
    return (
      <div className="match-tab-detail insight-grid">
        <Insight icon={<TrendingUp size={18} />} title="Forma local (pts)" value={String(homeFormPts)} />
        <Insight icon={<TrendingUp size={18} />} title="Forma visitante (pts)" value={String(awayFormPts)} />
        <Insight icon={<ShieldCheck size={18} />} title="Diferencia de forma" value={gap > 0 ? `+${gap} local` : gap < 0 ? `${gap} visitante` : "Equilibrado"} />
        <Insight icon={<AlertTriangle size={18} />} title="Estilos compatibles" value="Modelo basado en forma, goles, tabla y cobertura disponible" />
      </div>
    );
  }

  if (activeTab === "Alineaciones") {
    return (
      <div className="match-tab-detail lineups-tab">
        <TeamAvailability name={fixture.home.name} available={fixture.coverage.hasLineups} restDays={fixture.home.restDays} motivation={fixture.home.motivation} />
        <TeamAvailability name={fixture.away.name} available={fixture.coverage.hasLineups} restDays={fixture.away.restDays} motivation={fixture.away.motivation} />
        <p>Si no hay once inicial confirmado, el modelo aplica penalización automática y recomienda stake reducido.</p>
      </div>
    );
  }

  if (activeTab === "Contexto") {
    return (
      <div className="match-tab-detail insight-grid">
        <Insight icon={<Plane size={18} />} title="Viaje visitante" value={`${fixture.away.travelKm} km aprox.`} />
        <Insight icon={<UsersRound size={18} />} title="Motivación local" value={`${fixture.home.motivation}/100`} />
        <Insight icon={<UsersRound size={18} />} title="Motivación visitante" value={`${fixture.away.motivation}/100`} />
        <Insight icon={<AlertTriangle size={18} />} title="División baja" value={fixture.context.lowDivision ? "Ajuste activo" : "No activo"} />
      </div>
    );
  }

  return (
    <div className="match-tab-detail insight-grid">
      <Insight title="Forma local" value={fixture.home.form.join(" · ")} />
      <Insight title="Forma visitante" value={fixture.away.form.join(" · ")} />
      <Insight title="Descanso real" value={`${fixture.home.restDays}d vs ${fixture.away.restDays}d`} />
      <Insight title="Confianza" value={`${analysis.confidence.score}/100`} />
      <Insight title="Bajas / cobertura" value={fixture.coverage.hasInjuries ? "Lesiones disponibles" : "Lesiones no confirmadas"} />
      <Insight title="Riesgo clima" value={fixture.context.weatherRisk} />
    </div>
  );
}

function StatsTable({ fixture }: { fixture: Fixture }) {
  const rows = [
    [`${fixture.home.tablePosition}°`, "Posición", `${fixture.away.tablePosition}°`],
    [String(formatPoints(fixture.home.tablePosition)), "Puntos aprox.", String(formatPoints(fixture.away.tablePosition))],
    [String(fixture.home.goalsFor), "Goles a favor", String(fixture.away.goalsFor)],
    [String(fixture.home.goalsAgainst), "Goles en contra", String(fixture.away.goalsAgainst)],
    [String(fixture.home.goalsFor - fixture.home.goalsAgainst), "Diferencia de gol", String(fixture.away.goalsFor - fixture.away.goalsAgainst)],
  ];
  return (
    <div className="stats">
      {rows.map(([left, label, right]) => <div className="stat" key={label}><span>{left}</span><em>{label}</em><span>{right}</span></div>)}
      <div className="stat form-row">
        <span><Form letters={fixture.home.form} /></span>
        <em>Racha (últimos 5)</em>
        <span><Form letters={fixture.away.form} /></span>
      </div>
      <div className="stat">
        <span>{fixture.coverage.hasLineups ? "Sí" : "No"}</span>
        <em>Once confirmado</em>
        <span>{fixture.coverage.hasXg ? "xG" : "Proxy"}</span>
      </div>
    </div>
  );
}

function formatPoints(position: number) {
  return String(Math.max(1, Math.round(60 - position * 2.2)));
}

function _MiniBar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="mini-bar"><span>{label}</span><i><b className={tone} style={{ width: `${value}%` }} /></i><strong>{value}%</strong></div>;
}

function Insight({ icon, title, value }: { icon?: React.ReactNode; title: string; value: string }) {
  return <div className="insight-card">{icon}<span>{title}</span><strong>{value}</strong></div>;
}

function TeamAvailability({ name, available, restDays, motivation }: { name: string; available: boolean; restDays: number; motivation: number }) {
  return (
    <div className="availability-card">
      <strong>{name}</strong>
      <span>{available ? "Once disponible" : "Once no confirmado"}</span>
      <small>Descanso {restDays}d · Motivación {motivation}/100</small>
    </div>
  );
}

function Form({ letters }: { letters: string[] }) {
  return <>{letters.map((letter, index) => <b className={`form-badge ${letter}`} key={`${letter}-${index}`}>{letter}</b>)}</>;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()} - ${formatTime(value)} COT`;
}
