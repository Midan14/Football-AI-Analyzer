"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { AnalysisResult, DeepAnalysisResult, Fixture } from "@/shared/domain";

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
  doc.text(`Iteraciones: ${monteCarlo.iterations}`, 14, y);
  y += 6;
  doc.text(`Sharp Ratio: ${monteCarlo.sharpRatio}`, 14, y);
  y += 6;
  doc.text(`Confianza Over 2.5: ${monteCarlo.over25Confidence}%`, 14, y);
  y += 6;

  autoTable(doc, {
    startY: y + 4,
    head: [["Métrica", "Valor"]],
    body: [
      ["Iteraciones", String(monteCarlo.iterations)],
      ["Over 2.5 Confianza", `${monteCarlo.over25Confidence}%`],
      ["Sharp Ratio", String(monteCarlo.sharpRatio)],
    ],
    theme: "striped",
    headStyles: { fillColor: [139, 92, 246] },
    margin: { left: 14 },
  });

  return (doc as any).lastAutoTable?.finalY ?? y + 40;
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
