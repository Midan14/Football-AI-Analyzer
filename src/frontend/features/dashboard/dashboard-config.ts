import {
  Bell,
  Brain,
  CalendarDays,
  CircleHelp,
  ClipboardList,
  Globe2,
  History,
  Layers3,
  LineChart,
  ListChecks,
  Play,
  Settings,
  Star,
  TrendingUp,
  Zap,
} from "lucide-react";

export const navItems = [
  ["Dashboard Global", TrendingUp],
  ["Match Center", Globe2],
  ["Calendario", CalendarDays],
  ["Ligas y Países", Layers3],
  ["Partidos en Vivo", Play],
  ["Modelos AI", LineChart],
  ["Análisis Profundo", Brain],
  ["Oportunidades", Zap],
  ["Historial de Análisis", History],
  ["Mis Predicciones", ListChecks],
  ["Alertas", Bell],
  ["Watchlist", Star],
  ["Informes", ClipboardList],
  ["Configuración", Settings],
  ["Ayuda", CircleHelp],
] as const;

export const riskRows = [
  ["Alta variabilidad", "Resultados volátiles por rotación de jugadores.", "ALTO", "high", "▲"],
  ["Información limitada", "Datos incompletos o con retraso en alineaciones.", "MEDIO", "medium", "▲"],
  ["Factores externos", "Convocatorias al primer equipo, lesiones no confirmadas.", "MEDIO", "medium", "▲"],
  ["Rotación / Relajación", "NO CONFIRMADO - no apostar fuerte sin once inicial.", "BAJO", "low", "↻"],
  ["Evento outlier inesperado", "ESTIMADO - no observable pre-partido.", "BAJO", "low", "☺"],
] as const;

export const modelModes = ["Conservador", "Balanceado", "Agresivo"] as const;

export const scenarios = [
  ["base", "Base", "Sin ajuste adicional"],
  ["lineups", "Once confirmado", "+4 confianza"],
  ["rotation", "Rotación", "-9 confianza"],
  ["weather", "Clima adverso", "-5 confianza"],
] as const;

export type ModelMode = (typeof modelModes)[number];
export type ScenarioId = (typeof scenarios)[number][0];
export type DensityMode = "comfortable" | "compact";
