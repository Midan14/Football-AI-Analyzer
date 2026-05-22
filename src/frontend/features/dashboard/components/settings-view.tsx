"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Database, Loader2, Save, Settings, Trash2, User, Zap, Brain } from "lucide-react";
import { ModelMode, ScenarioId, DensityMode } from "../dashboard-config";

type SettingsViewProps = {
  provider: string;
  modelMode: ModelMode;
  scenario: ScenarioId;
  density: DensityMode;
  bankroll: number;
  onModeChange: (mode: ModelMode) => void;
  onScenarioChange: (scenario: ScenarioId) => void;
  onDensityChange: (density: DensityMode) => void;
  onBankrollChange: (bankroll: number) => void;
  onProviderClick: () => void;
};

const modelModes: [ModelMode, string][] = [
  ["Conservador", "−3 pts de confianza y stake más prudente (aplicado en el servidor)"],
  ["Balanceado", "Sin ajuste · configuración por defecto"],
  ["Agresivo", "+2 pts de confianza (aplicado en el servidor)"],
];

const scenarios: [ScenarioId, string, string][] = [
  ["base", "Base", "Sin ajuste de escenario"],
  ["lineups", "Once confirmado", "+4 pts de confianza"],
  ["rotation", "Rotación probable", "−9 pts de confianza"],
  ["weather", "Clima adverso", "−5 pts de confianza"],
];

export function SettingsView({
  provider,
  modelMode,
  scenario,
  density,
  bankroll,
  onModeChange,
  onScenarioChange,
  onDensityChange,
  onBankrollChange,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onProviderClick,
}: SettingsViewProps) {
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Bogota");
  const [language, setLanguage] = useState<"es" | "en">("es");
  const [notifications, setNotifications] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "ok" | "error">("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const [clearingCache, setClearingCache] = useState(false);
  const [mlStatus, setMlStatus] = useState<{ status: string; message?: string; samples?: number; models?: string[] }>({ status: "unknown" });
  const [mlTraining, setMlTraining] = useState(false);
  const [providerStatus, setProviderStatus] = useState<{
    provider: string;
    message: string;
    status: "healthy" | "degraded" | "unhealthy";
    redis: "healthy" | "unhealthy" | "unavailable";
  } | null>(null);

  useEffect(() => {
    fetch("/api/auth/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data?.name) setName(data.data.name);
        if (data?.data?.timezone) setTimezone(data.data.timezone);
        if (data?.data?.language) setLanguage(data.data.language);
        if (data?.data?.notificationsEnabled !== undefined) setNotifications(data.data.notificationsEnabled);
      })
      .catch(() => {});
  }, []);

  const fetchMlStatus = async () => {
    try {
      const res = await fetch("/api/ml/status");
      if (!res.ok) return;
      const data = await res.json();
      setMlStatus(data.data?.status ?? { status: "unknown" });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchMlStatus();
    const interval = setInterval(fetchMlStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const services = data?.data?.services;
        if (!services?.dataProvider) return;
        setProviderStatus({
          provider: services.dataProvider.provider,
          message: services.dataProvider.message,
          status: services.dataProvider.status,
          redis: services.redis?.status ?? "unavailable",
        });
      })
      .catch(() => {});
  }, []);

  const handleTrainML = async () => {
    setMlTraining(true);
    try {
      const res = await fetch("/api/ml/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extract: true, limit: 200, trials: 30 }),
      });
      const data = await res.json();
      setMlStatus(data.data?.status ?? { status: "unknown" });
    } catch {
      setMlStatus({ status: "error", message: "Error de red al iniciar entrenamiento." });
    } finally {
      setMlTraining(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setSaveStatus("idle");
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(name.trim() && { name: name.trim() }),
          timezone, language, modelMode,
          notificationsEnabled: notifications,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? `Error ${res.status}`);
      }
      setSaveStatus("ok");
      setSaveMsg("Perfil guardado");
    } catch (err) {
      setSaveStatus("error");
      setSaveMsg(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      const res = await fetch("/api/cache/clear", { method: "POST" });
      if (!res.ok) throw new Error("No se pudo limpiar la cache");
      alert("Cache limpiada. Los próximos análisis traerán datos frescos.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo limpiar la cache");
    } finally {
      setClearingCache(false);
    }
  };

  return (
    <section className="view-workspace cfg-view">
      <article className="cfg-header">
        <div>
          <h2><Settings size={22} /> Configuración</h2>
          <p>Motor de análisis, preferencias visuales, perfil y datos del proveedor.</p>
        </div>
      </article>

      <div className="cfg-grid">
        {/* Motor del modelo */}
        <article className="cfg-card">
          <h3><Zap size={16} /> Modo del Modelo</h3>
          <span className="cfg-active">Activo: {modelMode}</span>
          <div className="cfg-options">
            {modelModes.map(([mode, desc]) => (
              <button key={mode} className={`cfg-option ${modelMode === mode ? "active" : ""}`} onClick={() => onModeChange(mode)}>
                <strong>{mode}</strong>
                <span>{desc}</span>
              </button>
            ))}
          </div>
        </article>

        {/* Escenario */}
        <article className="cfg-card">
          <h3><Settings size={16} /> Escenario Base</h3>
          <span className="cfg-active">Activo: {scenario}</span>
          <div className="cfg-options">
            {scenarios.map(([id, label, desc]) => (
              <button key={id} className={`cfg-option ${scenario === id ? "active" : ""}`} onClick={() => onScenarioChange(id)}>
                <strong>{label}</strong>
                <span>{desc}</span>
              </button>
            ))}
          </div>
        </article>

        {/* Densidad */}
        <article className="cfg-card">
          <h3><Settings size={16} /> Densidad Visual</h3>
          <div className="cfg-options">
            {(["comfortable", "compact"] as const).map((item) => (
              <button key={item} className={`cfg-option ${density === item ? "active" : ""}`} onClick={() => onDensityChange(item)}>
                <strong>{item === "comfortable" ? "Cómodo" : "Compacto"}</strong>
                <span>{item === "comfortable" ? "Más espacio entre elementos" : "Más información en pantalla"}</span>
              </button>
            ))}
          </div>
        </article>

        {/* Bankroll */}
        <article className="cfg-card">
          <h3><Database size={16} /> Bankroll (Kelly Criterion)</h3>
          <p className="cfg-desc">Define tu bankroll para que Kelly calcule stakes en unidades reales.</p>
          <div className="cfg-bankroll">
            <input
              type="number"
              value={bankroll}
              onChange={(e) => onBankrollChange(Math.max(10, parseInt(e.target.value) || 100))}
              min={10}
              step={50}
              className="cfg-input"
            />
            <span className="cfg-unit">unidades</span>
          </div>
          <div className="cfg-bankroll-info">
            <span>1u = {(bankroll / 100).toFixed(1)} unidades (1%)</span>
            <span>Cap por mercado = {(bankroll * 0.01).toFixed(0)} unidades (1%)</span>
          </div>
        </article>

        {/* ML Training */}
        <article className="cfg-card">
          <h3><Brain size={16} /> Modelos ML</h3>
          <div className="cfg-motor-info">
            <div><span>Estado</span><b>{mlStatus.status === "success" ? "Entrenado ✓" : mlStatus.status === "running" ? "Entrenando..." : mlStatus.status === "error" ? "Error" : "Sin entrenar"}</b></div>
            {mlStatus.samples != null && <div><span>Datos</span><b>{mlStatus.samples} partidos</b></div>}
            {mlStatus.models && mlStatus.models.length > 0 && (
              <div><span>Modelos</span><b>{mlStatus.models.join(", ")}</b></div>
            )}
            {mlStatus.message && <div style={{ color: mlStatus.status === "error" ? "#f87171" : "#94a3b8", fontSize: 12, marginTop: 6 }}>{mlStatus.message}</div>}
          </div>
          <button
            className="cfg-save-btn"
            onClick={handleTrainML}
            disabled={mlTraining || mlStatus.status === "running"}
            style={{ marginTop: 12 }}
          >
            {mlTraining ? <Loader2 size={14} className="spin" /> : <Brain size={14} />}
            {mlTraining || mlStatus.status === "running" ? "Entrenando modelos..." : "Entrenar Modelos ML"}
          </button>
          <div style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>
            Entrena el pipeline Python sobre datos históricos. El análisis usará ML cuando haya un modelo disponible.
          </div>
        </article>

        {/* Proveedor de datos */}
        <article className="cfg-card">
          <h3><Database size={16} /> Proveedor de Datos</h3>
          <div className="cfg-provider">
            <div className="cfg-provider-info">
              <strong>{providerStatus?.provider ?? provider}</strong>
              <span>{providerStatus?.message ?? "Estado del proveedor pendiente"}</span>
            </div>
            <span className="cfg-provider-status">● {providerStatus?.status ?? "Activo"}</span>
          </div>
          <div className="cfg-provider-details">
            <div><span>Backend</span><b>{providerStatus?.provider ?? provider}</b></div>
            <div><span>Redis</span><b>{providerStatus?.redis ?? "desconocido"}</b></div>
            <div><span>Datos</span><b>Fixtures, odds, estadísticas y lineups según cobertura</b></div>
            <div><span>Cache</span><b>TTL dinámico por tipo de dato</b></div>
          </div>
          <button className="cfg-clear-btn" onClick={handleClearCache} disabled={clearingCache}>
            <Trash2 size={13} /> {clearingCache ? "Limpiando..." : "Limpiar cache Redis"}
          </button>
        </article>

        {/* Motor info */}
        <article className="cfg-card">
          <h3><Zap size={16} /> Motor de Análisis</h3>
          <div className="cfg-motor-info">
            <div><span>Versión</span><b>v2.4.1</b></div>
            <div><span>Modelos</span><b>Auditados por estado</b></div>
            <div><span>Ensemble</span><b>Poisson + NegBinom + ELO + Forma</b></div>
            <div><span>Staking</span><b>Kelly Fraccional (25%)</b></div>
            <div><span>Simulación</span><b>Monte Carlo híbrido 50k</b></div>
            <div><span>Heavy Tail</span><b>Binomial negativa</b></div>
            <div><span>Actualización</span><b>15s (live) / 60s (pre)</b></div>
            <div><span>Cache</span><b>Redis (TTL dinámico)</b></div>
          </div>
        </article>

        {/* Perfil */}
        <article className="cfg-card wide">
          <h3><User size={16} /> Perfil de Cuenta</h3>
          <div className="cfg-profile-grid">
            <label className="cfg-field">
              <span>Nombre</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" className="cfg-input" />
            </label>
            <label className="cfg-field">
              <span>Zona horaria</span>
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="cfg-input">
                <option value="America/Bogota">América/Bogotá (COT)</option>
                <option value="America/Mexico_City">América/Ciudad de México</option>
                <option value="America/Buenos_Aires">América/Buenos Aires</option>
                <option value="America/New_York">América/Nueva York</option>
                <option value="Europe/Madrid">Europa/Madrid</option>
                <option value="America/Sao_Paulo">América/São Paulo</option>
              </select>
            </label>
            <label className="cfg-field">
              <span>Idioma</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value as "es" | "en")} className="cfg-input">
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="cfg-field checkbox">
              <input type="checkbox" checked={notifications} onChange={(e) => setNotifications(e.target.checked)} />
              <span>Notificaciones activas</span>
            </label>
          </div>
          <div className="cfg-save-row">
            <button className="cfg-save-btn" onClick={handleSaveProfile} disabled={saving}>
              {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
              {saving ? "Guardando..." : "Guardar perfil"}
            </button>
            {saveStatus === "ok" && <span className="cfg-save-ok"><CheckCircle2 size={13} /> {saveMsg}</span>}
            {saveStatus === "error" && <span className="cfg-save-err">{saveMsg}</span>}
          </div>
        </article>
      </div>
    </section>
  );
}
