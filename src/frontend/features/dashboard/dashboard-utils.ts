export function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Bogota",
  });
}

export function formatShortDate(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export function round(value: number) {
  return Math.round(value * 10) / 10;
}

export function clampToPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scenarioLabelText(scenario: string) {
  if (scenario === "lineups") return "Once confirmado";
  if (scenario === "rotation") return "Rotación";
  if (scenario === "weather") return "Clima adverso";
  return "Base";
}

export function formPoints(form: string[]) {
  return form.reduce((total, result) => total + (result === "W" ? 3 : result === "D" ? 1 : 0), 0);
}
