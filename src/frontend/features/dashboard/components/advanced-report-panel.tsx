"use client";

/**
 * Informe de 27 secciones en la app: narrativa + tablas desde buildAdvancedReport,
 * y figuras generadas en código con lógica de negocio real (Poisson, Monte Carlo,
 * H2H, xG, value bets) — mismos componentes que Análisis Profundo.
 */

import { useMemo } from "react";
import type { AnalysisResult, Fixture } from "@/shared/domain";
import { buildAdvancedReport, type ReportSection } from "@/frontend/lib/advanced-report";
import { useDeepAnalysis } from "@/frontend/hooks/use-deep-analysis";
import { ReportFigureBlock } from "./report-figures";

/** Secciones del PDF que llevan gráfico calculado en código */
const SECTIONS_WITH_FIGURES = new Set([3, 4, 5, 8, 9, 23]);

function ReportTable({
  columns,
  rows,
  tableNo,
  caption,
}: {
  columns: string[];
  rows: string[][];
  tableNo: number;
  caption?: string;
}) {
  return (
    <figure className="arp-table-figure">
      <div className="arp-table-wrap">
        <table className="arp-table">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const hasValue = row.some((c) => c.toUpperCase().includes("VALOR") || (c.startsWith("+") && c.includes("%")));
              return (
                <tr key={ri} className={hasValue ? "arp-row-value" : undefined}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className={
                        cell.toUpperCase().includes("VALOR") || (cell.startsWith("+") && cell.includes("%"))
                          ? "arp-cell-value"
                          : undefined
                      }
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <figcaption className="arp-table-caption">Tabla {tableNo}. {caption ?? ""}</figcaption>
    </figure>
  );
}

function SectionCard({
  section,
  tableNo,
  fixture,
  analysis,
  deep,
  deepLoading,
}: {
  section: ReportSection;
  tableNo?: number;
  fixture: Fixture;
  analysis: AnalysisResult;
  deep?: import("@/shared/domain").DeepAnalysisResult | null;
  deepLoading: boolean;
}) {
  const showFigure = SECTIONS_WITH_FIGURES.has(section.index);

  return (
    <article className="arp-section" id={`arp-sec-${section.index}`}>
      <h4 className="arp-section-title">
        <span className="arp-section-index">{section.index}</span>
        {section.title}
      </h4>

      {section.paragraphs.map((p, i) => (
        <p key={i} className="arp-paragraph">
          {p}
        </p>
      ))}

      {showFigure && (
        <div className="arp-figures">
          {deepLoading && section.index === 8 ? (
            <p className="arp-figure-loading">Cargando simulación Monte Carlo…</p>
          ) : (
            <ReportFigureBlock
              sectionIndex={section.index}
              fixture={fixture}
              analysis={analysis}
              deep={deep}
            />
          )}
        </div>
      )}

      {section.table && tableNo != null && (
        <ReportTable
          columns={section.table.columns}
          rows={section.table.rows}
          tableNo={tableNo}
          caption={section.title}
        />
      )}

      {section.caveats && section.caveats.length > 0 && (
        <ul className="arp-caveats">
          {section.caveats.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function AdvancedReportPanel({ fixture, analysis }: { fixture: Fixture; analysis: AnalysisResult }) {
  const report = useMemo(() => buildAdvancedReport(fixture, analysis), [fixture, analysis]);
  const { data: deep, isLoading: deepLoading } = useDeepAnalysis(fixture.id);

  const tableNumbers = useMemo(() => {
    let tbl = 0;
    return report.sections.map((s) => (s.table ? ++tbl : undefined));
  }, [report.sections]);

  return (
    <section className="arp">
      <header className="arp-header">
        <h3>{report.title}</h3>
        <p>
          {report.subtitle} · 27 secciones · gráficos con motor Poisson / Monte Carlo / value bets
        </p>
      </header>

      {report.coverageCaveats.length > 0 && (
        <div className="arp-coverage">
          <strong>Avisos de cobertura / fiabilidad</strong>
          <ul>
            {report.coverageCaveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <nav className="arp-toc" aria-label="Tabla de contenidos">
        <h4 className="arp-toc-title">Tabla de Contenidos</h4>
        <ol className="arp-toc-list">
          {report.sections.map((s) => (
            <li key={s.index}>
              <a href={`#arp-sec-${s.index}`}>
                <span className="arp-toc-num">{s.index}</span>
                {s.title}
                {SECTIONS_WITH_FIGURES.has(s.index) ? " ◆" : ""}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="arp-sections">
        {report.sections.map((s, i) => (
          <SectionCard
            key={s.index}
            section={s}
            tableNo={tableNumbers[i]}
            fixture={fixture}
            analysis={analysis}
            deep={deep}
            deepLoading={deepLoading}
          />
        ))}
      </div>

      <footer className="arp-disclaimer">
        <p>
          Las figuras marcadas con ◆ se calculan en tiempo real desde los datos del partido y el motor de análisis
          profundo (no son imágenes estáticas). Apuesta responsable. 18+.
        </p>
      </footer>
    </section>
  );
}
