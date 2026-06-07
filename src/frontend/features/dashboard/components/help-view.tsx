"use client";

import { useState } from "react";
import { BookOpen, Globe2, Brain, Bell, Star, FileText, BarChart3, Zap, Target, Activity, TrendingUp, Settings, HelpCircle } from "lucide-react";
import { CONFIDENCE_THRESHOLDS } from "@/frontend/lib/confidence-display";

type FAQItem = { q: string; a: string };

const confidenceDecisionCopy = `APOSTAR (≥${CONFIDENCE_THRESHOLDS.bet}%): el modelo tiene suficiente certeza. PRECAUCIÓN (${CONFIDENCE_THRESHOLDS.caution}-${CONFIDENCE_THRESHOLDS.bet - 1}%): hay valor pero con riesgo. NO APOSTAR (<${CONFIDENCE_THRESHOLDS.caution}%): datos insuficientes o riesgo alto.`;

const faqs: FAQItem[] = [
  { q: "¿Cómo selecciono un partido?", a: "Usa los selectores en la barra superior: País → Liga → Fecha → Partido. También puedes buscar un equipo directamente con el buscador o navegar desde el Calendario." },
  { q: "¿Qué significa el Edge?", a: "Edge = Probabilidad del modelo - Probabilidad implícita del mercado. Un edge positivo (+5%) significa que el modelo cree que el mercado subestima esa probabilidad. Es donde hay valor para apostar." },
  { q: "¿Cómo funciona el Ensemble?", a: "El Ensemble combina 4 modelos (Poisson, Binomial Negativa, ELO, Forma) con pesos dinámicos. Cada modelo aporta su predicción y el resultado final es un promedio ponderado. Mayor acuerdo entre modelos = mayor confianza." },
  { q: "¿Qué es Kelly Criterion?", a: "Es una fórmula matemática que calcula el stake óptimo basado en tu edge y bankroll. Usamos Kelly Fraccional (25%) para ser conservadores. Nunca recomienda más del 1% del bankroll en un solo mercado." },
  { q: "¿Por qué la confianza es baja para algunas ligas?", a: "La confianza se penaliza cuando faltan datos: sin cuotas reales (-8pts), sin alineaciones (-5pts), sin xG (-4pts), liga de baja cobertura (-15pts). Ligas elite tienen más datos = mayor confianza. Revisa las penalizaciones en el panel de cada partido." },
  { q: "¿Los datos son en tiempo real?", a: "En Partidos en Vivo la lista se actualiza cada 10 segundos. En el tablero del día, los marcadores en vivo se refrescan cada 15 segundos cuando estás en vistas que muestran el calendario. Los partidos programados se recargan cada ~30–60 segundos. Las cuotas se cargan en segundo plano tras los fixtures. En modo demo se usan datos de referencia." },
  { q: "¿Cómo agrego equipos favoritos?", a: "Haz clic en la ⭐ junto al nombre de un equipo en el Match Center o Partidos en Vivo. Los equipos favoritos aparecen en Favoritos (Watchlist) y activan alertas sonoras para goles." },
  { q: "¿Puedo exportar el análisis?", a: "Sí. Desde la vista Informes o Modelos AI puedes exportar un PDF completo con todas las probabilidades, recomendaciones, Kelly y tabla de valor." },
  { q: "¿Qué significa APOSTAR/PRECAUCIÓN/NO APOSTAR?", a: confidenceDecisionCopy },
  { q: "¿Cómo se resuelven las predicciones?", a: "Ve a Mis Predicciones y haz clic en Resolver predicciones finalizadas. El sistema consulta el resultado real del partido y cierra automáticamente el pick con WON/LOST/VOID y el ROI correspondiente. También puedes importar resultados via CSV." },
];

const guides = [
  { icon: Globe2, title: "Dashboard Global", desc: "Resumen del día con todos los partidos. Click en cualquier partido para abrir el Match Center." },
  { icon: Target, title: "Match Center", desc: "Análisis completo de un partido: modelos auditados, alineaciones, eventos, estadísticas, Kelly y recomendación." },
  { icon: BarChart3, title: "Calendario", desc: "Navega por fechas pasadas y futuras. Calendario mensual + vista multi-día de próximos partidos." },
  { icon: Globe2, title: "Ligas y Países", desc: "Explora 171 países y sus ligas. Ve la cobertura real de datos para cada liga." },
  { icon: Activity, title: "Partidos en Vivo", desc: "Seguimiento en tiempo real (polling cada 10s) con eventos, estadísticas y alertas sonoras para equipos favoritos." },
  { icon: Brain, title: "Modelos AI", desc: "Laboratorio de modelos: Ensemble, Comparación visual, Simulación interactiva de xG, Kelly y Pipeline." },
  { icon: Zap, title: "Análisis Profundo", desc: "Monte Carlo, Teoría de Juegos, Black Swan, Psicología, Árbitro, Fatiga y Insights accionables." },
  { icon: FileText, title: "Historial de Análisis", desc: "Todos los análisis ejecutados guardados en la base de datos. Re-analiza partidos pasados." },
  { icon: TrendingUp, title: "Mis Predicciones", desc: "Tracking de apuestas: win rate, profit, ROI. Importa resultados via CSV." },
  { icon: Bell, title: "Alertas", desc: "Centro de riesgo: escanea todos los partidos del día y detecta valor, riesgos y eventos en vivo." },
  { icon: Star, title: "Favoritos (Watchlist)", desc: "Partidos de tus equipos favoritos con cuotas y estado en vivo." },
  { icon: FileText, title: "Informes", desc: "Informe pre-partido profesional exportable a PDF con toda la información del análisis." },
  { icon: Settings, title: "Configuración", desc: "Modo del modelo, bankroll, proveedor de datos, perfil de cuenta y cache." },
];

export function HelpView() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <section className="view-workspace help-view">
      <article className="help-header">
        <div>
          <h2><HelpCircle size={22} /> Centro de Ayuda</h2>
          <p>Football AI Analyzer · Modelos auditados · Motor v2.4.1</p>
        </div>
      </article>

      {/* Quick guide */}
      <div className="help-section">
        <h3><BookOpen size={16} /> Guía de Vistas</h3>
        <div className="help-guides-grid">
          {guides.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="help-guide-card">
              <Icon size={18} className="help-guide-icon" />
              <div>
                <strong>{title}</strong>
                <span>{desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Models info */}
      <div className="help-section">
        <h3><Brain size={16} /> Modelos de Predicción (16)</h3>
        <div className="help-models">
          <div className="help-model-group">
            <h4>Ensemble (activos en cada análisis)</h4>
            <ol>
              <li><b>Poisson Bivariado</b> — Distribución de probabilidad de goles</li>
              <li><b>Binomial Negativa</b> — Sobredispersión para partidos volátiles</li>
              <li><b>ELO Rating Dinámico</b> — Fuerza del equipo por posición y puntos</li>
              <li><b>Forma Ponderada</b> — Momentum de últimos 5 partidos</li>
            </ol>
          </div>
          <div className="help-model-group">
            <h4>Modelos especializados</h4>
            <ol start={5}>
              <li><b>Kelly Criterion</b> — Stake óptimo por mercado</li>
              <li><b>Skellam Distribution</b> — Diferencia de goles / Asian Handicaps</li>
              <li><b>Zero-Inflated Poisson</b> — Partidos defensivos (0-0)</li>
              <li><b>Hawkes Process</b> — Momentum intra-partido</li>
              <li><b>Bayesian Updating</b> — Actualización en vivo</li>
              <li><b>Kalman Filter</b> — Tendencia del equipo</li>
              <li><b>Expected Threat (xT)</b> — Dominancia territorial</li>
            </ol>
          </div>
          <div className="help-model-group">
            <h4>Análisis profundo</h4>
            <ol start={12}>
              <li><b>Monte Carlo híbrido</b> — 50k simulaciones por defecto</li>
              <li><b>t-Student Heavy Tail</b> — Black Swan events</li>
              <li><b>Teoría de Juegos</b> — Nash Equilibrium</li>
              <li><b>Análisis Psicológico</b> — Choking, motivación</li>
              <li><b>Perfil Arbitral</b> — Tarjetas, sesgo, rigor</li>
            </ol>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="help-section">
        <h3><HelpCircle size={16} /> Preguntas Frecuentes</h3>
        <div className="help-faq">
          {faqs.map((faq, i) => (
            <div key={i} className={`help-faq-item ${openFaq === i ? "open" : ""}`}>
              <button className="help-faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                <span>{faq.q}</span>
                <span className="help-faq-toggle">{openFaq === i ? "−" : "+"}</span>
              </button>
              {openFaq === i && <p className="help-faq-a">{faq.a}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Tech info */}
      <div className="help-section">
        <h3><Settings size={16} /> Información Técnica</h3>
        <div className="help-tech">
          <div><span>Framework</span><b>Next.js 16 + React 19</b></div>
          <div><span>Proveedor</span><b>API-Football (según plan activo)</b></div>
          <div><span>Base de datos</span><b>PostgreSQL + Prisma ORM</b></div>
          <div><span>Cache</span><b>Redis (TTL dinámico 15-60s)</b></div>
          <div><span>Auth</span><b>NextAuth.js v4</b></div>
          <div><span>Actualización live</span><b>Polling 10s (vivo) / 15-60s (según vista)</b></div>
          <div><span>Modelos</span><b>16 activos (TypeScript nativo)</b></div>
          <div><span>Staking</span><b>Kelly fraccional conservador (25%)</b></div>
        </div>
      </div>

      <div className="help-footer">
        <p>⚠️ Football AI Analyzer es una herramienta de análisis informativo. No garantiza resultados. Apuesta responsable. 18+</p>
      </div>
    </section>
  );
}
