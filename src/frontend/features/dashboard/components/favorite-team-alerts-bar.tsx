"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, ChevronDown, Radio, Star, Volume2, VolumeX } from "lucide-react";
import { useFavoriteTeamLiveAlerts } from "@/frontend/hooks/use-favorite-team-live-alerts";
import {
  isBrowserNotificationSupported,
  readBrowserNotificationsEnabled,
  requestBrowserNotificationPermission,
} from "@/frontend/lib/browser-notifications";
import {
  readFavoriteAlertsBarExpanded,
  writeFavoriteAlertsBarExpanded,
} from "@/frontend/lib/favorite-team-storage";

type FavoriteTeamAlertsBarProps = {
  onAlert?: (message: string, type: "success" | "warning" | "info") => void;
};

export function FavoriteTeamAlertsBar({ onAlert }: FavoriteTeamAlertsBarProps) {
  const {
    favoriteTeamIds,
    favoriteLiveCount,
    soundEnabled,
    toggleSound,
    audioReady,
    lastAlert,
    isPolling,
  } = useFavoriteTeamLiveAlerts({
    onAlert: (alert, toast) => onAlert?.(toast.message, toast.type),
  });

  const [flashKind, setFlashKind] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const prevLiveCountRef = useRef(0);

  useEffect(() => {
    setNotificationsEnabled(readBrowserNotificationsEnabled());
    setExpanded(readFavoriteAlertsBarExpanded());
  }, []);

  const setExpandedPersisted = (value: boolean) => {
    setExpanded(value);
    writeFavoriteAlertsBarExpanded(value);
  };

  const toggleNotifications = async () => {
    const result = await requestBrowserNotificationPermission();
    setNotificationsEnabled(result === "granted" && readBrowserNotificationsEnabled());
  };

  useEffect(() => {
    if (!lastAlert) return;
    setFlashKind(lastAlert.kind);
    setExpandedPersisted(true);
    const flashTimer = window.setTimeout(() => setFlashKind(null), 2200);
    const collapseTimer = window.setTimeout(() => {
      if (favoriteLiveCount === 0) setExpandedPersisted(false);
    }, 12000);
    return () => {
      window.clearTimeout(flashTimer);
      window.clearTimeout(collapseTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to new alerts
  }, [lastAlert]);

  useEffect(() => {
    if (favoriteLiveCount > 0 && prevLiveCountRef.current === 0) {
      setExpandedPersisted(true);
    }
    prevLiveCountRef.current = favoriteLiveCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- expand once when live starts
  }, [favoriteLiveCount]);

  if (favoriteTeamIds.length === 0) return null;

  const statusLabel =
    favoriteLiveCount > 0
      ? `${favoriteLiveCount} en vivo`
      : "Sin partidos en vivo";

  if (!expanded) {
    return (
      <>
        {flashKind === "goal" && <div className="live-alert-flash goal" aria-hidden="true" />}
        {flashKind === "card-red" && <div className="live-alert-flash card-red" aria-hidden="true" />}
        {flashKind === "penalty" && <div className="live-alert-flash penalty" aria-hidden="true" />}

        <button
          type="button"
          className={`live-alerts-chip ${soundEnabled ? "on" : "off"} ${favoriteLiveCount > 0 ? "live" : ""}`}
          onClick={() => setExpandedPersisted(true)}
          title="Alertas de equipos favoritos — clic para configurar sonido y push"
          aria-expanded={false}
          aria-label={`Alertas de favoritos: ${statusLabel}. Abrir panel.`}
        >
          <Star size={14} className="live-alerts-star" />
          <span className="live-alerts-chip-label">Alertas</span>
          {favoriteLiveCount > 0 ? (
            <span className="live-alerts-live-pill compact">
              <Radio size={10} />
              {favoriteLiveCount}
            </span>
          ) : (
            <span className="live-alerts-chip-muted">{favoriteTeamIds.length} ⭐</span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      {flashKind === "goal" && <div className="live-alert-flash goal" aria-hidden="true" />}
      {flashKind === "card-red" && <div className="live-alert-flash card-red" aria-hidden="true" />}
      {flashKind === "penalty" && <div className="live-alert-flash penalty" aria-hidden="true" />}

      <div
        className={`live-alerts-bar ${soundEnabled ? "on" : "off"} ${isPolling ? "polling" : ""}`}
        role="region"
        aria-label="Alertas de equipos favoritos"
      >
        <div className="live-alerts-bar-header">
          <div className="live-alerts-bar-main">
            <Star size={14} className="live-alerts-star" />
            <div className="live-alerts-copy">
              <strong>Alertas de favoritos</strong>
              <span>{statusLabel}</span>
            </div>
            {favoriteLiveCount > 0 && (
              <span className="live-alerts-live-pill">
                <Radio size={11} />
                LIVE
              </span>
            )}
          </div>
          <button
            type="button"
            className="live-alerts-collapse-btn"
            onClick={() => setExpandedPersisted(false)}
            title="Minimizar alertas"
            aria-label="Minimizar panel de alertas"
          >
            <ChevronDown size={16} />
          </button>
        </div>

        <button
          type="button"
          className={`live-alerts-sound-btn ${soundEnabled ? "active" : ""}`}
          onClick={toggleSound}
          title={
            soundEnabled
              ? "Sonidos de gol, tarjeta y penalti activados"
              : "Activar sonidos de eventos en vivo"
          }
        >
          {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          {soundEnabled ? "Sonido ON" : "Sonido OFF"}
        </button>

        {isBrowserNotificationSupported() && (
          <button
            type="button"
            className={`live-alerts-sound-btn ${notificationsEnabled ? "active" : ""}`}
            onClick={toggleNotifications}
            title="Notificaciones del sistema (gol, tarjeta, penalti)"
          >
            {notificationsEnabled ? <Bell size={15} /> : <BellOff size={15} />}
            {notificationsEnabled ? "Push ON" : "Activar push"}
          </button>
        )}

        {!audioReady && soundEnabled && (
          <small className="live-alerts-hint">Toca la pantalla una vez para activar el audio del navegador.</small>
        )}
      </div>
    </>
  );
}
