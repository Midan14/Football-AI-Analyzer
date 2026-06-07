"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

type DataStatusBannerProps = {
  fixturesDataSource?: string;
  onRefresh?: () => void;
};

export function DataStatusBanner({ fixturesDataSource, onRefresh }: DataStatusBannerProps) {
  if (fixturesDataSource === "api-football-quota") {
    return (
      <div className="data-status-banner data-status-banner--quota" role="alert">
        <AlertTriangle size={18} />
        <div>
          <strong>Cuota diaria de API-Football agotada</strong>
          <p>
            No se muestran partidos de demostración. Los datos reales vuelven cuando se renueva la cuota
            o amplías el plan en API-Sports.
          </p>
        </div>
        {onRefresh ? (
          <button type="button" className="data-status-banner__btn" onClick={onRefresh}>
            <RefreshCw size={16} />
            Reintentar
          </button>
        ) : null}
      </div>
    );
  }

  if (fixturesDataSource === "api-football-rate-limit") {
    return (
      <div className="data-status-banner data-status-banner--demo" role="status">
        <RefreshCw size={18} />
        <div>
          <strong>Saturación temporal de API-Football</strong>
          <p>
            El proveedor está aplicando un rate-limit por segundo. Reintentando automáticamente —
            los datos vuelven en unos segundos.
          </p>
        </div>
        {onRefresh ? (
          <button type="button" className="data-status-banner__btn" onClick={onRefresh}>
            <RefreshCw size={16} />
            Reintentar ahora
          </button>
        ) : null}
      </div>
    );
  }

  if (fixturesDataSource === "demo-fallback") {
    return (
      <div className="data-status-banner data-status-banner--demo" role="status">
        <AlertTriangle size={18} />
        <div>
          <strong>Modo demostración</strong>
          <p>
            La API no devolvió partidos reales para los filtros actuales. Los datos mostrados son de ejemplo.
          </p>
        </div>
        {onRefresh ? (
          <button type="button" className="data-status-banner__btn" onClick={onRefresh}>
            <RefreshCw size={16} />
            Reintentar
          </button>
        ) : null}
      </div>
    );
  }

  return null;
}
