"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { AnalysisResult, DeepAnalysisResult, Fixture } from "@/shared/domain";
import { buildAdvancedReport, type ReportFigure, type ReportSection } from "./advanced-report";

const GRADE_COLORS: Record<string, [number, number, number]> = {
  A: [34, 197, 94],
  B: [56, 189, 248],
  C: [251, 191, 36],
  D: [239, 68, 68],
};

function addSafeMarketSection(
  doc: jsPDF,
  safeMarket: DeepAnalysisResult["safeMarket"],
  startY: number
): number {
  doc.setFontSize(14);
  doc.setTextColor(33, 33, 33);
  doc.text("Mercado Seguro", 14, startY);

  const gradeColor = GRADE_COLORS[safeMarket.riskGrade] ?? [100, 100, 100];
  const [gr, gg, gb] = gradeColor;
  doc.setFontSize(10);

  let y = startY + 8;
  doc.text(`Mercado: ${safeMarket.market}`, 14, y);
  y += 6;
  doc.text(`Confianza: ${safeMarket.confidence}%`, 14, y);
  y += 6;
  doc.text(`Edge: ${safeMarket.edge}%`, 14, y);
  y += 6;

  doc.setDrawColor(gr, gg, gb);
  doc.setFillColor(gr, gg, gb);
  doc.roundedRect(14, y, 30, 10, 2, 2, "FD");
  doc.setTextColor(255, 255, 255);
  doc.text(`GRADO ${safeMarket.riskGrade}`, 15, y + 7);
  doc.setTextColor(33, 33, 33);

  y += 12;
  doc.setFontSize(9);
  const explanationLines = doc.splitTextToSize(safeMarket.explanation, pageWidth - 28);
  doc.text(explanationLines, 14, y + 4);
  y += explanationLines.length * 4 + 10;

  return y;
}

function addMonteCarloSection(
  doc: jsPDF,
  monteCarlo: DeepAnalysisResult["monteCarlo"],
  startY: number
): number {
  doc.setFontSize(14);
  doc.setTextColor(33, 33, 33);
  doc.text("Distribución Monte Carlo", 14, startY);

  let y = startY + 10;
  doc.setFontSize(10);
  doc.text(`Iteraciones: ${monteCarlo.iterations.toLocaleString("es-CO")}`, 14, y);
  y += 6;
  doc.text(`Sharp Ratio: ${monteCarlo.sharpRatio}`, 14, y);
  y += 6;
  doc.text(`Confianza Over 2.5: ${monteCarlo.over25Confidence}%`, 14, y);
  y += 6;
  if (monteCarlo.hybridMix) {
    doc.text(
      `Mezcla híbrida: ${monteCarlo.hybridMix.poissonPct}% Poisson / ${monteCarlo.hybridMix.heavyTailPct}% cola pesada`,
      14,
      y
    );
    y += 6;
  }

  const scorelineRows = monteCarlo.topScorelines?.slice(0, 8).map((row) => [
    row.score,
    `${row.probability}%`,
  ]) ?? [];

  autoTable(doc, {
    startY: y + 4,
    head: [["Métrica", "Valor"]],
    body: [
      ["Iteraciones", monteCarlo.iterations.toLocaleString("es-CO")],
      ["Over 2.5 Confianza", `${monteCarlo.over25Confidence}%`],
      ["Sharp Ratio", String(monteCarlo.sharpRatio)],
      ...(monteCarlo.hybridMix
        ? [["Mezcla", `${monteCarlo.hybridMix.poissonPct}% Poisson / ${monteCarlo.hybridMix.heavyTailPct}% cola pesada`]]
        : []),
    ],
    theme: "striped",
    headStyles: { fillColor: [139, 92, 246] },
    margin: { left: 14 },
  });

  y = (doc as any).lastAutoTable?.finalY ?? y + 40;

  if (scorelineRows.length) {
    autoTable(doc, {
      startY: y + 8,
      head: [["Marcador", "Probabilidad simulada"]],
      body: scorelineRows,
      theme: "striped",
      headStyles: { fillColor: [34, 197, 94] },
      margin: { left: 14 },
    });
    y = (doc as any).lastAutoTable?.finalY ?? y + 40;
  }

  return y;
}

function addHeavyTailSection(
  doc: jsPDF,
  heavyTail: DeepAnalysisResult["heavyTail"],
  startY: number
): number {
  doc.setFontSize(14);
  doc.setTextColor(33, 33, 33);
  doc.text("Análisis de Cola Pesada / Black Swan", 14, startY);

  let y = startY + 10;
  doc.setFontSize(10);
  doc.text(`Distribución: ${heavyTail.distribution}`, 14, y);
  y += 6;
  doc.text(`Grados de libertad: ${heavyTail.degreesOfFreedom}`, 14, y);
  y += 6;
  doc.text(`Probabilidad Black Swan: ${heavyTail.blackSwanProb}%`, 14, y);
  y += 6;
  doc.text(`Score máximo sorpresa: ${heavyTail.maxSurpriseScore}/100`, 14, y);
  y += 6;

  const severityColor =
    heavyTail.blackSwanProb > 50 ? [239, 68, 68] as const : heavyTail.blackSwanProb > 25 ? [251, 191, 36] as const : [34, 197, 94] as const;
  doc.setTextColor(severityColor[0], severityColor[1], severityColor[2]);
  doc.setFontSize(11);
  doc.text(
    heavyTail.blackSwanProb > 50
      ? "Alta probabilidad de evento outlier. Reducir exposición."
      : heavyTail.blackSwanProb > 25
        ? "Probabilidad moderada de evento outlier."
        : "Baja probabilidad de evento outlier.",
    14,
    y
  );
  doc.setTextColor(33, 33, 33);

  return y + 12;
}

function addGameTheorySection(
  doc: jsPDF,
  gameTheory: DeepAnalysisResult["gameTheory"],
  startY: number
): number {
  doc.setFontSize(14);
  doc.setTextColor(33, 33, 33);
  doc.text("Teoría de Juegos - Matriz de Pagos", 14, startY);

  let y = startY + 10;

  autoTable(doc, {
    startY: y,
    head: [["Estrategia", "Payoff Local", "Payoff Visitante"]],
    body: gameTheory.payoffMatrix.map((row) => [
      row.strategy,
      String(row.homePayoff),
      String(row.awayPayoff),
    ]),
    theme: "striped",
    headStyles: { fillColor: [56, 189, 248] },
    margin: { left: 14 },
  });

  y = (doc as any).lastAutoTable?.finalY ?? y + 40;
  y += 6;
  doc.setFontSize(10);
  doc.setTextColor(33, 33, 33);
  doc.text(`Estrategia dominante local: ${gameTheory.homeDominantStrategy}`, 14, y);
  y += 6;
  doc.text(`Estrategia dominante visitante: ${gameTheory.awayDominantStrategy}`, 14, y);
  y += 6;
  doc.setFontSize(9);
  const nashLines = doc.splitTextToSize(`Equilibrio Nash: ${gameTheory.nashEquilibrium}`, pageWidth - 28);
  doc.text(nashLines, 14, y + 4);

  return y + nashLines.length * 4 + 14;
}

function addPsychologicalSection(
  doc: jsPDF,
  psychological: DeepAnalysisResult["psychological"],
  startY: number
): number {
  doc.setFontSize(14);
  doc.setTextColor(33, 33, 33);
  doc.text("Análisis Psicológico", 14, startY);

  const y = startY + 10;
  doc.setFontSize(10);

  const psychRows = [
    ["Riesgo de Choking", `${psychological.chokingRisk}%`],
    ["Ventaja Motivacional", `${psychological.motivationAdvantage}pts`],
    ["Manejo de Presión", `${psychological.pressureHandlingScore}/100`],
    ["Score de Momento", `${psychological.momentumScore}/100`],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Factor", "Score"]],
    body: psychRows,
    theme: "striped",
    headStyles: { fillColor: [251, 191, 36] },
    margin: { left: 14 },
  });

  return (doc as any).lastAutoTable?.finalY ?? y + 40;
}

function addRefereeSection(
  doc: jsPDF,
  referee: DeepAnalysisResult["referee"],
  startY: number
): number {
  doc.setFontSize(14);
  doc.setTextColor(33, 33, 33);
  doc.text("Impacto Arbitral", 14, startY);

  let y = startY + 10;
  doc.setFontSize(10);
  doc.text(`Tarjetas esperadas: ${referee.expectedCards}`, 14, y);
  y += 6;
  doc.text(`Ajuste sesgo local: ${referee.homeBiasAdj}`, 14, y);
  y += 6;
  doc.text(`Riesgo de penal: ${referee.penaltyRisk}%`, 14, y);

  return y + 12;
}

function addRadarSection(
  doc: jsPDF,
  radar: DeepAnalysisResult["radar"],
  startY: number
): number {
  doc.setFontSize(14);
  doc.setTextColor(33, 33, 33);
  doc.text("Radar 360 (12 Ejes)", 14, startY);

  const radarRows = radar.map((axis) => [axis.axis, `${axis.home} / ${axis.away}`]);

  autoTable(doc, {
    startY: startY + 8,
    head: [["Eje", "Local / Visitante"]],
    body: radarRows,
    theme: "striped",
    headStyles: { fillColor: [34, 197, 94] },
    margin: { left: 14 },
  });

  return (doc as any).lastAutoTable?.finalY ?? startY + 40;
}

function addInsightsSection(
  doc: jsPDF,
  insights: DeepAnalysisResult["insights"],
  startY: number
): number {
  if (insights.length === 0) return startY;

  doc.setFontSize(14);
  doc.setTextColor(33, 33, 33);
  doc.text("Insights Accionables", 14, startY);

  const insightRows = insights.map((i) => [
    i.category,
    i.finding.slice(0, 80) + (i.finding.length > 80 ? "..." : ""),
    i.action.slice(0, 60) + (i.action.length > 60 ? "..." : ""),
    `${i.confidence}%`,
  ]);

  autoTable(doc, {
    startY: startY + 8,
    head: [["Categoría", "Hallazgo", "Acción", "Confianza"]],
    body: insightRows,
    theme: "striped",
    headStyles: { fillColor: [59, 130, 246] },
    margin: { left: 14 },
    styles: { fontSize: 8 },
  });

  return (doc as any).lastAutoTable?.finalY ?? startY + 40;
}

function addAIPromptAppendix(doc: jsPDF, aiPrompt: string) {
  doc.addPage();
  doc.setFontSize(14);
  doc.setTextColor(33, 33, 33);
  doc.text("Apéndice — Prompt de IA", 14, 20);

  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  const lines = aiPrompt.split("\n");
  let y = 28;

  for (const line of lines) {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
    const truncated = line.length > 110 ? line.slice(0, 110) : line;
    doc.text(truncated, 14, y);
    y += 3.5;
  }
}

const pageWidth = 180;

export function exportReportToPDF(
  fixture: Fixture,
  analysis: AnalysisResult | DeepAnalysisResult,
  modelMode: string,
  scenario: string,
  riskLevel: string
) {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();

  const isDeep = "monteCarlo" in analysis;

  doc.setFontSize(20);
  doc.setTextColor(33, 33, 33);
  doc.text("Football AI Analyzer - Reporte Pre-partido", pw / 2, 20, { align: "center" });

  doc.setFontSize(14);
  doc.text(`${fixture.home.name} vs ${fixture.away.name}`, pw / 2, 35, { align: "center" });
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text(`Liga: ${fixture.leagueName} | Fecha: ${fixture.kickoff}`, pw / 2, 43, { align: "center" });

  doc.setFontSize(12);
  doc.setTextColor(33, 33, 33);
  doc.text("Recomendación", 14, 58);
  doc.setFontSize(10);
  doc.text(`Mercado: ${analysis.recommendation.market}`, 14, 66);
  doc.text(`Cuota justa: ${analysis.recommendation.fairOdds}`, 14, 72);
  doc.text(`Cuota mínima: ${analysis.recommendation.minimumOdds}`, 14, 78);
  doc.text(`Stake sugerido: ${analysis.recommendation.stakeUnits}u`, 14, 84);
  doc.text(`Confianza: ${analysis.confidence.score}%`, 14, 90);
  doc.text(`Riesgo: ${riskLevel}`, 14, 96);
  doc.text(`Modo: ${modelMode} | Escenario: ${scenario}`, 14, 102);

  doc.setFontSize(12);
  doc.text("Probabilidades Modelo", 14, 118);
  autoTable(doc, {
    startY: 122,
    head: [["Mercado", "Probabilidad"]],
    body: [
      ["Local gana", `${analysis.probabilities.homeWin}%`],
      ["Empate", `${analysis.probabilities.draw}%`],
      ["Visitante gana", `${analysis.probabilities.awayWin}%`],
      ["Over 2.5", `${analysis.probabilities.over25}%`],
      ["Under 3.5", `${analysis.probabilities.under35}%`],
      ["BTTS Sí", `${analysis.probabilities.btts}%`],
    ],
    theme: "striped",
    headStyles: { fillColor: [56, 189, 248] },
  });

  let currentY = (doc as any).lastAutoTable?.finalY || 160;

  doc.setFontSize(12);
  doc.setTextColor(33, 33, 33);
  doc.text("Tabla de Valor", 14, currentY + 12);
  autoTable(doc, {
    startY: currentY + 16,
    head: [["Mercado", "Modelo", "Mercado", "Edge", "Veredicto"]],
    body: analysis.valueTable.map((row) => [
      row.market,
      `${row.modelProbability}%`,
      `${row.marketProbability}%`,
      `${row.edge > 0 ? "+" : ""}${row.edge}%`,
      row.verdict,
    ]),
    theme: "striped",
    headStyles: { fillColor: [139, 92, 246] },
  });

  currentY = (doc as any).lastAutoTable?.finalY || 220;

  if (analysis.riskFlags.length > 0) {
    currentY += 10;
    doc.setFontSize(12);
    doc.setTextColor(33, 33, 33);
    doc.text("Flags de Riesgo", 14, currentY);
    autoTable(doc, {
      startY: currentY + 4,
      head: [["Flag", "Severidad"]],
      body: analysis.riskFlags.map((flag) => [flag.label, flag.severity]),
      theme: "striped",
      headStyles: { fillColor: [255, 98, 88] },
    });
    currentY = (doc as any).lastAutoTable?.finalY ?? currentY;
  }

  if (isDeep) {
    const deep = analysis as DeepAnalysisResult;

    if (deep.safeMarket) {
      currentY = addSafeMarketSection(doc, deep.safeMarket, currentY + 14);
    }

    currentY = addMonteCarloSection(doc, deep.monteCarlo, currentY + 12);
    currentY = addHeavyTailSection(doc, deep.heavyTail, currentY + 12);
    currentY = addGameTheorySection(doc, deep.gameTheory, currentY + 12);
    currentY = addPsychologicalSection(doc, deep.psychological, currentY + 12);
    currentY = addRefereeSection(doc, deep.referee, currentY + 12);
    currentY = addRadarSection(doc, deep.radar, currentY + 12);

    if (deep.insights && deep.insights.length > 0) {
      currentY = addInsightsSection(doc, deep.insights, currentY + 12);
    }

    if (deep.aiPrompt) {
      addAIPromptAppendix(doc, deep.aiPrompt);
    }
  }

  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text(
    "Aviso: El análisis es informativo y no garantiza resultados. Apuesta responsable. 18+",
    pw / 2,
    Math.min(currentY + 20, 280),
    { align: "center" }
  );

  doc.save(`reporte-${fixture.home.name}-vs-${fixture.away.name}.pdf`);
}

// ── Advanced 27-section report ────────────────────────────────────────────────

const A4_BOTTOM = 282;
const MARGIN_X = 14;
const CONTENT_W = 182;

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > A4_BOTTOM) {
    doc.addPage();
    return 20;
  }
  return y;
}

function drawBarsFigure(doc: jsPDF, y: number, fig: Extract<ReportFigure, { kind: "bars" }>): number {
  let cursor = ensureSpace(doc, y, 16 + fig.bars.length * 7);
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(fig.title, MARGIN_X, cursor);
  cursor += 5;
  const max = fig.max ?? Math.max(1, ...fig.bars.map((b) => b.value));
  const barMaxW = 110;
  for (const bar of fig.bars) {
    const w = Math.max(0.5, (bar.value / max) * barMaxW);
    const [r, g, b] = bar.color ?? [56, 189, 248];
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text(String(bar.label).slice(0, 14), MARGIN_X, cursor + 3.5);
    doc.setFillColor(r, g, b);
    doc.rect(MARGIN_X + 32, cursor, w, 4.5, "F");
    doc.setTextColor(90, 90, 90);
    doc.text(`${bar.value.toFixed(1)}${fig.unit ?? ""}`, MARGIN_X + 34 + w, cursor + 3.5);
    cursor += 7;
  }
  return cursor + 2;
}

function drawGroupedBarsFigure(doc: jsPDF, y: number, fig: Extract<ReportFigure, { kind: "groupedBars" }>): number {
  let cursor = ensureSpace(doc, y, 16 + fig.groups.length * 12);
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`${fig.title}  (azul=modelo, gris=mercado)`, MARGIN_X, cursor);
  cursor += 5;
  const max = Math.max(1, ...fig.groups.flatMap((gr) => [gr.model, gr.market]));
  const barMaxW = 100;
  for (const gr of fig.groups) {
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text(gr.label.slice(0, 12), MARGIN_X, cursor + 3.5);
    doc.setFillColor(56, 189, 248);
    doc.rect(MARGIN_X + 26, cursor, Math.max(0.5, (gr.model / max) * barMaxW), 3.5, "F");
    doc.setTextColor(90, 90, 90);
    doc.text(`${gr.model.toFixed(1)}%`, MARGIN_X + 28 + (gr.model / max) * barMaxW, cursor + 3);
    doc.setFillColor(150, 150, 150);
    doc.rect(MARGIN_X + 26, cursor + 4.5, Math.max(0.5, (gr.market / max) * barMaxW), 3.5, "F");
    doc.text(`${gr.market.toFixed(1)}%`, MARGIN_X + 28 + (gr.market / max) * barMaxW, cursor + 7.5);
    cursor += 12;
  }
  return cursor + 2;
}

function drawRadarFigure(doc: jsPDF, y: number, fig: Extract<ReportFigure, { kind: "radar" }>): number {
  const size = 70;
  let cursor = ensureSpace(doc, y, size + 16);
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`${fig.title}  (azul=${"local"}, naranja=${"visita"})`, MARGIN_X, cursor);
  cursor += 4;
  const cx = MARGIN_X + size / 2 + 10;
  const cy = cursor + size / 2;
  const radius = size / 2;
  const n = fig.axes.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

  // grid
  doc.setDrawColor(210, 210, 210);
  for (let ring = 1; ring <= 4; ring += 1) {
    const rr = (radius * ring) / 4;
    for (let i = 0; i < n; i += 1) {
      const x1 = cx + rr * Math.cos(angle(i));
      const y1 = cy + rr * Math.sin(angle(i));
      const x2 = cx + rr * Math.cos(angle((i + 1) % n));
      const y2 = cy + rr * Math.sin(angle((i + 1) % n));
      doc.line(x1, y1, x2, y2);
    }
  }
  // axes + labels
  doc.setFontSize(6.5);
  doc.setTextColor(110, 110, 110);
  for (let i = 0; i < n; i += 1) {
    const x = cx + radius * Math.cos(angle(i));
    const yy = cy + radius * Math.sin(angle(i));
    doc.line(cx, cy, x, yy);
    doc.text(fig.axes[i].axis.slice(0, 10), cx + (radius + 4) * Math.cos(angle(i)) - 6, yy + (radius + 4) * Math.sin(angle(i)) / radius);
  }

  const plot = (key: "home" | "away", color: [number, number, number]) => {
    doc.setDrawColor(color[0], color[1], color[2]);
    for (let i = 0; i < n; i += 1) {
      const v1 = Math.max(0, Math.min(100, fig.axes[i][key])) / 100;
      const v2 = Math.max(0, Math.min(100, fig.axes[(i + 1) % n][key])) / 100;
      const x1 = cx + radius * v1 * Math.cos(angle(i));
      const y1 = cy + radius * v1 * Math.sin(angle(i));
      const x2 = cx + radius * v2 * Math.cos(angle((i + 1) % n));
      const y2 = cy + radius * v2 * Math.sin(angle((i + 1) % n));
      doc.line(x1, y1, x2, y2);
    }
  };
  plot("home", [56, 189, 248]);
  plot("away", [249, 115, 22]);

  return cursor + size + 6;
}

function renderSection(doc: jsPDF, section: ReportSection, y: number): number {
  let cursor = ensureSpace(doc, y, 18);
  doc.setFontSize(13);
  doc.setTextColor(33, 33, 33);
  doc.text(`${section.index}. ${section.title}`, MARGIN_X, cursor);
  cursor += 6;

  doc.setFontSize(9.5);
  doc.setTextColor(55, 55, 55);
  for (const para of section.paragraphs) {
    const lines = doc.splitTextToSize(para, CONTENT_W);
    cursor = ensureSpace(doc, cursor, lines.length * 4.6 + 2);
    doc.text(lines, MARGIN_X, cursor);
    cursor += lines.length * 4.6 + 3;
  }

  if (section.figure) {
    if (section.figure.kind === "bars") cursor = drawBarsFigure(doc, cursor, section.figure);
    else if (section.figure.kind === "groupedBars") cursor = drawGroupedBarsFigure(doc, cursor, section.figure);
    else if (section.figure.kind === "radar") cursor = drawRadarFigure(doc, cursor, section.figure);
  }

  if (section.table) {
    cursor = ensureSpace(doc, cursor, 20);
    autoTable(doc, {
      startY: cursor,
      head: [section.table.columns],
      body: section.table.rows,
      theme: "striped",
      styles: { fontSize: 7.5, cellPadding: 1.4 },
      headStyles: { fillColor: [56, 189, 248] },
      margin: { left: MARGIN_X, right: MARGIN_X },
    });
    cursor = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursor) + 4;
  }

  if (section.caveats && section.caveats.length > 0) {
    cursor = ensureSpace(doc, cursor, section.caveats.length * 4.5 + 4);
    doc.setFontSize(8);
    doc.setTextColor(180, 95, 6);
    for (const c of section.caveats) {
      const lines = doc.splitTextToSize(`* ${c}`, CONTENT_W);
      cursor = ensureSpace(doc, cursor, lines.length * 4);
      doc.text(lines, MARGIN_X, cursor);
      cursor += lines.length * 4 + 1;
    }
  }

  return cursor + 6;
}

export function exportAdvancedReportToPDF(
  fixture: Fixture,
  analysis: AnalysisResult,
  modelMode: string,
  scenario: string,
  riskLevel: string
) {
  const report = buildAdvancedReport(fixture, analysis);
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();

  // Cover
  doc.setFontSize(22);
  doc.setTextColor(33, 33, 33);
  doc.text(report.title, pw / 2, 28, { align: "center" });
  doc.setFontSize(13);
  doc.setTextColor(70, 70, 70);
  doc.text(report.subtitle, pw / 2, 40, { align: "center" });
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text(`Fecha: ${fixture.kickoff}  |  Modo: ${modelMode}  |  Escenario: ${scenario}  |  Riesgo: ${riskLevel}`, pw / 2, 49, { align: "center" });
  doc.text(`27 secciones · datos reales · confianza ${analysis.confidence.score}/100`, pw / 2, 56, { align: "center" });

  let y = 68;
  if (report.coverageCaveats.length > 0) {
    doc.setFontSize(11);
    doc.setTextColor(180, 95, 6);
    doc.text("Avisos de cobertura / fiabilidad", MARGIN_X, y);
    y += 6;
    doc.setFontSize(8.5);
    for (const c of report.coverageCaveats) {
      const lines = doc.splitTextToSize(`* ${c}`, CONTENT_W);
      y = ensureSpace(doc, y, lines.length * 4);
      doc.text(lines, MARGIN_X, y);
      y += lines.length * 4 + 1.5;
    }
    y += 4;
  }

  for (const section of report.sections) {
    y = renderSection(doc, section, y);
  }

  // Footer disclaimer on the last page
  y = ensureSpace(doc, y, 16);
  doc.setFontSize(8.5);
  doc.setTextColor(150, 150, 150);
  const disclaimer = doc.splitTextToSize(
    "Aviso: informe informativo y educativo. Las cifras provienen del motor estadistico real (Poisson/Dixon-Coles y modelo hibrido bajo quality gate); modulos marcados como experimentales no alteran las probabilidades. Las apuestas conllevan riesgo. 18+.",
    CONTENT_W
  );
  doc.text(disclaimer, MARGIN_X, y);

  doc.save(`informe-avanzado-${fixture.home.name}-vs-${fixture.away.name}.pdf`);
}
