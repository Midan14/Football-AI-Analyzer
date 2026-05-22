"use client";

import { Star, Zap } from "lucide-react";
import type { FixtureEdgeHint } from "@/frontend/hooks/use-fixture-edge-hints";
import type { Fixture } from "@/shared/domain";

function formatKickoffTime(kickoff: string): string {
  return new Date(kickoff).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Bogota",
  });
}

type LeagueFixturePreviewRowProps = {
  fixture: Fixture;
  edgeHint?: FixtureEdgeHint;
  onClick: () => void;
};

export function LeagueFixturePreviewRow({ fixture, edgeHint, onClick }: LeagueFixturePreviewRowProps) {
  return (
    <button type="button" className={`lcv-fx-row ${fixture.status}`} onClick={onClick}>
      <div className="lcv-fx-time">
        {fixture.status === "live" ? (
          <span className="lcv-fx-live">{fixture.elapsed ?? "?"}′</span>
        ) : fixture.status === "final" ? (
          <span className="lcv-fx-final">FT</span>
        ) : (
          <span>{formatKickoffTime(fixture.kickoff)}</span>
        )}
      </div>
      <div className="lcv-fx-teams">
        <span>{fixture.home.name}</span>
        {fixture.result ? (
          <b className={fixture.status === "live" ? "live" : ""}>
            {fixture.result.homeGoals} - {fixture.result.awayGoals}
          </b>
        ) : (
          <b className="vs">vs</b>
        )}
        <span>{fixture.away.name}</span>
      </div>
      <div className="lcv-fx-badges">
        {edgeHint?.hasValue && (
          <span className="lcv-badge value" title={`Edge ${edgeHint.edge}% · ${edgeHint.market}`}>
            VALUE
          </span>
        )}
        {edgeHint?.hasMlSignal && (
          <span className="lcv-badge ml" title="Señal ML activa">
            AI
          </span>
        )}
        <Zap size={12} className="lcv-fx-action" />
      </div>
    </button>
  );
}

export function LeagueFavoriteStar({ pinned, onToggle }: { pinned: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`lcv-pin-btn ${pinned ? "active" : ""}`}
      aria-label={pinned ? "Quitar de favoritas" : "Añadir a favoritas"}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <Star size={14} fill={pinned ? "currentColor" : "none"} />
    </button>
  );
}
