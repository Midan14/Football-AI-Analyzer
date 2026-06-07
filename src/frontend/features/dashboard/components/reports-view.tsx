"use client";

import { FileText, Download, Printer, TrendingUp, Shield, AlertTriangle, Target, BarChart3, Brain, Layers } from "lucide-react";
import type { Fixture, AnalysisResult } from "@/shared/domain";
import { exportReportToPDF, exportAdvancedReportToPDF } from "@/frontend/lib/export-report";
import { AdvancedReportPanel } from "./advanced-report-panel";
import { ModelMode, ScenarioId } from "../dashboard-config";
import { decisionFromConfidence } from "@/frontend/lib/confidence-display";

export function ReportsView({
  fixture,
  analysis,
  modelMode,
  scenario,
  riskLevel,
  onOpenMatch,
}: {
  fixture?: Fixture;
  analysis: AnalysisResult | null;
  modelMode: ModelMode;
  scenario: ScenarioId;
  riskLevel: string;
  onOpenMatch: () => void;
}) {
  const handleExportPDF = () => {
    if (!fixture || !analysis) return;
    try {
      exportReportToPDF(fixture, analysis, modelMode, scenario, riskLevel);
    } catch {
      alert("Error generando PDF");
    }
  };

  const handleExportAdvanced = () => {
    if (!fixture || !analysis) return;
    try {
      exportAdvancedReportToPDF(fixture, analysis, modelMode, scenario, riskLevel);
    } catch {
      alert("Error generando informe avanzado");
    }
  };

  const handlePrint = () => window.print();

  if (!fixture || !analysis) {
    return (
      <section className="view-workspace rpt-view">
        <article className="rpt-header">
          <div>
            <h2><FileText size={22} /> Informes</h2>
            <p>Selecciona un partido y ejecuta el análisis para generar un informe.</p>
          </div>
        </article>
        <div className="rpt-empty">
          <FileText size={48} />
          <strong>Sin informe disponible</strong>
          <p>Abre un partido en Match Center para generar el informe pre-partido.</p>
          <button onClick={onOpenMatch}>Ir al Match Center</button>
        </div>
      </section>
    );
  }

  const baseDecision = decisionFromConfidence(analysis.confidence.score);
  const decision =
    baseDecision === "PRECAUCION"
      ? "PRECAUCIÓN"
      : baseDecision === "NO_APOSTAR"
        ? "NO APOSTAR"
        : "APOSTAR";
  const decisionColor =
    baseDecision === "APOSTAR"
      ? "#34d399"
      : baseDecision === "PRECAUCION"
        ? "#f59e0b"
        : "#f43f5e";

  return (
    <section className="view-workspace rpt-view">
      {/* Header */}
      <article className="rpt-header">
        <div>
          <h2><FileText size={22} /> Informe Pre-Partido</h2>
          <p>{fixture.home.name} vs {fixture.away.name} · {fixture.leagueName}</p>
        </div>
        <div className="rpt-actions">
          <button className="rpt-btn" onClick={handleExportPDF}><Download size={14} /> Exportar PDF</button>
          <button className="rpt-btn" onClick={handleExportAdvanced}><Layers size={14} /> Informe Avanzado (27 secciones)</button>
          <button className="rpt-btn" onClick={handlePrint}><Printer size={14} /> Imprimir</button>
          <button className="rpt-btn primary" onClick={onOpenMatch}>Match Center</button>
        </div>
      </article>

      {/* Report content */}
      <div className="rpt-content">
        {/* Decision banner */}
        <div className="rpt-decision" style={{ borderColor: decisionColor }}>
          <div className="rpt-decision-main">
            <Shield size={28} color={decisionColor} />
            <div>
              <strong style={{ color: decisionColor }}>{decision}</strong>
              <span>Confianza {analysis.confidence.score}% · Riesgo {riskLevel}</span>
            </div>
          </div>
          <div className="rpt-decision-market">
            <span>Mercado</span>
            <strong>{analysis.recommendation.market}</strong>
          </div>
          <div className="rpt-decision-stake">
            <span>Stake</span>
            <strong>{analysis.recommendation.stakeUnits}u</strong>
          </div>
          <div className="rpt-decision-odds">
            <span>Cuota justa</span>
            <strong>{analysis.recommendation.fairOdds}</strong>
          </div>
        </div>

        {/* Rationale */}
        <div className="rpt-section">
          <h3><Brain size={16} /> Rationale</h3>
          <p className="rpt-rationale">{analysis.recommendation.rationale}</p>
        </div>

        {/* Probabilities */}
        <div className="rpt-section">
          <h3><BarChart3 size={16} /> Probabilidades del Modelo</h3>
          <div className="rpt-probs-grid">
            <div className="rpt-prob"><span>Local</span><b>{analysis.probabilities.homeWin}%</b></div>
            <div className="rpt-prob"><span>Empate</span><b>{analysis.probabilities.draw}%</b></div>
            <div className="rpt-prob"><span>Visita</span><b>{analysis.probabilities.awayWin}%</b></div>
            <div className="rpt-prob"><span>Over 2.5</span><b>{analysis.probabilities.over25}%</b></div>
            <div className="rpt-prob"><span>Under 3.5</span><b>{analysis.probabilities.under35}%</b></div>
            <div className="rpt-prob"><span>BTTS</span><b>{analysis.probabilities.btts}%</b></div>
          </div>
        </div>

        {/* Ensemble */}
        {analysis.ensemble && (
          <div className="rpt-section">
            <h3><Brain size={16} /> Ensemble (4 Modelos)</h3>
            <div className="rpt-ensemble">
              <span>Acuerdo: <b>{analysis.ensemble.modelAgreement}%</b></span>
              <span>Dominante: <b>{analysis.ensemble.dominantModel}</b></span>
              <span>L: <b>{analysis.ensemble.homeWin}%</b> | E: <b>{analysis.ensemble.draw}%</b> | V: <b>{analysis.ensemble.awayWin}%</b></span>
            </div>
          </div>
        )}

        {/* Kelly */}
        {analysis.kelly && analysis.kelly.bets.length > 0 && (
          <div className="rpt-section">
            <h3><TrendingUp size={16} /> Kelly Criterion</h3>
            <div className="rpt-kelly-info">
              <span>Exposición: <b>{analysis.kelly.totalExposure}%</b></span>
              <span>ROI: <b>{(analysis.kelly.expectedROI * 100).toFixed(1)}%</b></span>
              <span>Sharpe: <b>{analysis.kelly.sharpeRatio}</b></span>
            </div>
            <div className="rpt-kelly-bets">
              {analysis.kelly.bets.map((bet, i) => (
                <div key={i} className="rpt-kelly-bet">
                  <strong>{bet.market}</strong>
                  <span>{bet.stakeUnits}u · Edge +{bet.edge}% · {bet.riskLevel}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Value table */}
        <div className="rpt-section">
          <h3><Target size={16} /> Tabla de Valor</h3>
          <table className="rpt-table">
            <thead>
              <tr><th>Mercado</th><th>Modelo</th><th>Mercado</th><th>Edge</th><th>Veredicto</th></tr>
            </thead>
            <tbody>
              {analysis.valueTable.map(row => (
                <tr key={row.market} className={row.edge >= 5 ? "value" : row.edge < -7 ? "avoid" : ""}>
                  <td>{row.market}</td>
                  <td>{row.modelProbability}%</td>
                  <td>{row.marketProbability}%</td>
                  <td className={row.edge > 0 ? "positive" : "negative"}>{row.edge > 0 ? "+" : ""}{row.edge}%</td>
                  <td><span className={`rpt-verdict ${row.verdict.toLowerCase()}`}>{row.verdict}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Risk flags */}
        {analysis.riskFlags.length > 0 && (
          <div className="rpt-section">
            <h3><AlertTriangle size={16} /> Riesgos Detectados</h3>
            <div className="rpt-risks">
              {analysis.riskFlags.map(flag => (
                <div key={flag.id} className={`rpt-risk ${flag.severity}`}>
                  <span className="rpt-risk-sev">{flag.severity === "high" ? "🔴" : flag.severity === "medium" ? "🟡" : "🟢"}</span>
                  <span>{flag.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Penalties */}
        {analysis.confidence.penalties.length > 0 && (
          <div className="rpt-section">
            <h3><Shield size={16} /> Penalizaciones de Confianza</h3>
            <div className="rpt-penalties">
              {analysis.confidence.penalties.map(p => (
                <div key={p.id} className="rpt-penalty">
                  <span>{p.label}</span>
                  <b>-{p.points} pts</b>
                </div>
              ))}
              <div className="rpt-penalty total">
                <span>Base: 82 → Final: {analysis.confidence.score}</span>
                <b>-{82 - analysis.confidence.score} pts total</b>
              </div>
            </div>
          </div>
        )}

        {/* Advanced 27-section report (in-app, identical to deep PDF format) */}
        <AdvancedReportPanel fixture={fixture} analysis={analysis} />

        {/* Footer */}
        <div className="rpt-footer">
          <p>⚠️ Este informe es informativo y no garantiza resultados. Apuesta responsable. 18+</p>
          <p>Generado: {new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })} · Motor v2.4.1 · modelos auditados</p>
        </div>
      </div>
    </section>
  );
}
